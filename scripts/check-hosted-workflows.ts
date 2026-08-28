import { lstat, opendir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { parseDocument } from 'yaml';

const root = resolve(process.cwd());
const workflowRoot = join(root, '.github', 'workflows');
const failures: string[] = [];
const workflowFiles = new Map<string, JsonRecord>();
const MAX_WORKFLOW_FILES = 4096;
const MAX_WORKFLOW_DIRECTORY_ENTRIES = 100_000;
const MAX_WORKFLOW_DEPTH = 128;
const MAX_WORKFLOW_BYTES = 4 * 1024 * 1024;

for (const file of await walk(workflowRoot)) {
  const relativePath = relative(root, file).replaceAll('\\', '/');
  const contents = await readBoundedText(file, relativePath);
  if (/pull_request_target/iu.test(contents)) {
    failures.push(`${relativePath}: pull_request_target is not permitted for untrusted changes`);
  }
  try {
    const document = parseDocument(contents, {
      strict: true,
      uniqueKeys: true,
      prettyErrors: true,
    });
    if (document.errors.length > 0) {
      throw new Error(document.errors.map((error) => error.message).join(' '));
    }
    const value = document.toJS({ maxAliasCount: 0 }) as unknown;
    if (!isRecord(value)) throw new Error('workflow must be a YAML object');
    workflowFiles.set(relativePath, value);
  } catch (error) {
    failures.push(
      `${relativePath}: invalid workflow YAML (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

for (const [relativePath, workflow] of workflowFiles) {
  const permissions = workflow.permissions;
  if (!isRecord(permissions) || permissions.contents !== 'read') {
    failures.push(`${relativePath}: top-level permissions must grant contents: read explicitly`);
  }
  checkPermissions(permissions, `${relativePath} top-level permissions`, false);

  const concurrency = workflow.concurrency;
  if (
    !isRecord(concurrency) ||
    typeof concurrency.group !== 'string' ||
    !Object.hasOwn(concurrency, 'cancel-in-progress')
  ) {
    failures.push(`${relativePath}: workflow concurrency must define group and cancel-in-progress`);
  }

  const jobs = workflow.jobs;
  if (!isRecord(jobs)) {
    failures.push(`${relativePath}: jobs must be a YAML object`);
    continue;
  }
  for (const [jobId, rawJob] of Object.entries(jobs)) {
    if (!isRecord(rawJob)) {
      failures.push(`${relativePath}:${jobId}: job must be a YAML object`);
      continue;
    }
    if (typeof rawJob.uses === 'string') continue;
    if (!Number.isInteger(rawJob['timeout-minutes']) || Number(rawJob['timeout-minutes']) <= 0) {
      failures.push(`${relativePath}:${jobId}: timeout-minutes must be a positive integer`);
    }
    checkPermissions(
      rawJob.permissions,
      `${relativePath}:${jobId} permissions`,
      relativePath === '.github/workflows/codeql.yml' && jobId === 'analyze',
    );
    const steps = Array.isArray(rawJob.steps) ? rawJob.steps.filter(isRecord) : [];
    for (const step of steps) {
      const uses = step.uses;
      if (typeof uses === 'string' && uses.startsWith('actions/checkout@')) {
        const options = isRecord(step.with) ? step.with : {};
        if (options['persist-credentials'] !== false) {
          failures.push(`${relativePath}:${jobId}: checkout must set persist-credentials: false`);
        }
      }
      if (typeof uses === 'string' && uses.startsWith('actions/upload-artifact@')) {
        const options = isRecord(step.with) ? step.with : {};
        if (
          !Number.isInteger(options['retention-days']) ||
          Number(options['retention-days']) <= 0
        ) {
          failures.push(
            `${relativePath}:${jobId}: upload-artifact must set a positive retention-days value`,
          );
        }
      }
    }
  }
}

const ci = workflowFiles.get('.github/workflows/ci.yml');
const ciVerify = ci ? getJob(ci, 'verify', '.github/workflows/ci.yml') : undefined;
if (ciVerify) {
  const matrix = isRecord(isRecord(ciVerify.strategy) ? ciVerify.strategy.matrix : undefined)
    ? (ciVerify.strategy as JsonRecord).matrix
    : undefined;
  const os = matrix && isRecord(matrix) ? strings(matrix.os) : [];
  const node = matrix && isRecord(matrix) ? strings(matrix.node) : [];
  for (const expected of ['ubuntu-latest', 'windows-latest', 'macos-latest']) {
    if (!os.includes(expected)) failures.push(`ci.yml: OS matrix is missing ${expected}`);
  }
  for (const expected of ['24.17.0', '24.x']) {
    if (!node.includes(expected)) failures.push(`ci.yml: Node matrix is missing ${expected}`);
  }
  const steps = Array.isArray(ciVerify.steps) ? ciVerify.steps.filter(isRecord) : [];
  const runs = steps
    .map((step) => step.run)
    .filter((run): run is string => typeof run === 'string');
  if (!runs.some((run) => /\bpnpm\s+verify:hosted\b/u.test(run))) {
    failures.push('ci.yml: the matrix must run pnpm verify:hosted');
  }
  if (runs.some((run) => /\bpnpm\s+verify(?:\s|$)/u.test(run))) {
    failures.push('ci.yml: arbitrary PR revisions must not run the release-bound pnpm verify gate');
  }
}

const codeql = workflowFiles.get('.github/workflows/codeql.yml');
const codeqlJob = codeql ? getJob(codeql, 'analyze', '.github/workflows/codeql.yml') : undefined;
if (codeqlJob) {
  const permissions = codeqlJob.permissions;
  if (!isRecord(permissions) || permissions['security-events'] !== 'write') {
    failures.push('codeql.yml: analyze job must scope security-events: write to the job');
  }
  if (
    typeof codeqlJob.if !== 'string' ||
    !/event_name\s*!=\s*['"]pull_request['"]/u.test(codeqlJob.if)
  ) {
    failures.push('codeql.yml: SARIF-uploading analyze job must be excluded from pull requests');
  }
}
const codeqlPullRequestJob = codeql
  ? getJob(codeql, 'analyze-pr', '.github/workflows/codeql.yml')
  : undefined;
if (codeqlPullRequestJob) {
  if (
    typeof codeqlPullRequestJob.if !== 'string' ||
    !/event_name\s*==\s*['"]pull_request['"]/u.test(codeqlPullRequestJob.if)
  ) {
    failures.push('codeql.yml: analyze-pr job must be limited to pull requests');
  }
  const permissions = codeqlPullRequestJob.permissions;
  if (!isRecord(permissions) || permissions['security-events'] === 'write') {
    failures.push('codeql.yml: analyze-pr must not grant security-events: write');
  }
}

const security = workflowFiles.get('.github/workflows/security.yml');
const dependencyReview = security
  ? getJob(security, 'dependency-review', '.github/workflows/security.yml')
  : undefined;
if (dependencyReview) {
  if (typeof dependencyReview.if !== 'string' || !/pull_request/u.test(dependencyReview.if)) {
    failures.push('security.yml: dependency review must be limited to pull requests');
  }
  if (
    !isRecord(dependencyReview.permissions) ||
    dependencyReview.permissions.contents !== 'read' ||
    dependencyReview.permissions['pull-requests'] !== 'read'
  ) {
    failures.push(
      'security.yml: dependency review must use read-only contents and pull-request permissions',
    );
  }
}

const reuse = security ? getJob(security, 'reuse', '.github/workflows/security.yml') : undefined;
if (reuse) {
  const steps = Array.isArray(reuse.steps) ? reuse.steps.filter(isRecord) : [];
  if (
    !steps.some(
      (step) => typeof step.uses === 'string' && step.uses.startsWith('actions/checkout@'),
    )
  ) {
    failures.push('security.yml: REUSE validation must inspect the checked-out repository');
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `hosted workflow policy passed: ${workflowFiles.size} workflows, OS/Node matrix, permissions, concurrency, timeouts, and artifact retention checked\n`,
  );
}

type JsonRecord = Record<string, unknown>;

function getJob(document: JsonRecord, id: string, workflow: string): JsonRecord | undefined {
  const jobs = document.jobs;
  if (!isRecord(jobs) || !isRecord(jobs[id])) {
    failures.push(`${workflow}: missing ${id} job`);
    return undefined;
  }
  return jobs[id];
}

function checkPermissions(value: unknown, label: string, allowSecurityEventsWrite: boolean): void {
  if (value === undefined) return;
  if (value === 'read-all') return;
  if (typeof value === 'string') {
    failures.push(`${label}: scalar permissions must be read-all or an explicit mapping`);
    return;
  }
  if (!isRecord(value)) {
    failures.push(`${label}: permissions must be read-all or an explicit mapping`);
    return;
  }
  const allowedPermissions = new Set([
    'actions',
    'attestations',
    'checks',
    'contents',
    'deployments',
    'discussions',
    'id-token',
    'issues',
    'models',
    'packages',
    'pages',
    'pull-requests',
    'repository-projects',
    'security-events',
    'statuses',
  ]);
  for (const [permission, level] of Object.entries(value)) {
    if (!allowedPermissions.has(permission)) {
      failures.push(`${label}: ${permission}: unknown GitHub Actions permission`);
    }
    if (level !== 'read' && level !== 'write' && level !== 'none') {
      failures.push(`${label}: ${permission}: permission level must be read, write, or none`);
    }
    if (level === 'write-all' || level === 'admin') {
      failures.push(`${label}: ${permission}: ${String(level)} is not permitted`);
    }
    if (level === 'write' && permission === 'security-events' && !allowSecurityEventsWrite) {
      failures.push(
        `${label}: security-events: write is permitted only for the CodeQL analyze job`,
      );
    }
    if (level === 'write' && permission !== 'security-events') {
      failures.push(`${label}: ${permission}: write exceeds the workflow policy`);
    }
  }
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function walk(directory: string): Promise<string[]> {
  return walkBounded(directory, { entries: 0, files: 0 }, 0);
}

async function walkBounded(
  directory: string,
  state: { entries: number; files: number },
  depth: number,
): Promise<string[]> {
  if (depth > MAX_WORKFLOW_DEPTH)
    throw new Error(`workflow directory depth exceeds ${MAX_WORKFLOW_DEPTH}`);
  const handle = await opendir(directory);
  const result: string[] = [];
  try {
    for await (const entry of handle) {
      state.entries += 1;
      if (state.entries > MAX_WORKFLOW_DIRECTORY_ENTRIES)
        throw new Error(
          `workflow directory traversal exceeds ${MAX_WORKFLOW_DIRECTORY_ENTRIES} entries`,
        );
      const path = join(directory, entry.name);
      if (entry.isDirectory()) result.push(...(await walkBounded(path, state, depth + 1)));
      else if (entry.isFile() && /\.ya?ml$/iu.test(entry.name)) {
        state.files += 1;
        if (state.files > MAX_WORKFLOW_FILES)
          throw new Error(`workflow file count exceeds ${MAX_WORKFLOW_FILES}`);
        result.push(path);
      }
    }
  } finally {
    await handle.close().catch(() => undefined);
  }
  return result.sort();
}

async function readBoundedText(path: string, label: string): Promise<string> {
  const information = await lstat(path);
  if (!information.isFile() || information.isSymbolicLink())
    throw new Error(`${label}: workflow must be a regular file`);
  if (information.size > MAX_WORKFLOW_BYTES)
    throw new Error(`${label}: workflow exceeds the ${MAX_WORKFLOW_BYTES}-byte limit`);
  const contents = await readFile(path, 'utf8');
  if (Buffer.byteLength(contents, 'utf8') > MAX_WORKFLOW_BYTES)
    throw new Error(`${label}: workflow exceeds the ${MAX_WORKFLOW_BYTES}-byte limit`);
  return contents;
}
