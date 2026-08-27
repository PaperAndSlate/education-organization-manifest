import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

const root = resolve(process.cwd());
const workflowRoot = join(root, '.github', 'workflows');
const failures: string[] = [];
const workflowFiles = new Map<string, JsonRecord>();

for (const file of await walk(workflowRoot)) {
  const relativePath = relative(root, file).replaceAll('\\', '/');
  const contents = await readFile(file, 'utf8');
  if (/pull_request_target/iu.test(contents)) {
    failures.push(`${relativePath}: pull_request_target is not permitted for untrusted changes`);
  }
  try {
    const document = parseYaml(contents) as unknown;
    if (!isRecord(document)) throw new Error('workflow must be a YAML object');
    workflowFiles.set(relativePath, document);
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
  checkPermissions(permissions, `${relativePath} top-level permissions`);

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
    checkPermissions(rawJob.permissions, `${relativePath}:${jobId} permissions`);
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

function checkPermissions(value: unknown, label: string): void {
  if (!isRecord(value)) return;
  for (const [permission, level] of Object.entries(value)) {
    if (level === 'write-all' || level === 'admin') {
      failures.push(`${label}: ${permission}: ${String(level)} is not permitted`);
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
  const entries = await readdir(directory, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(path)));
    else if (entry.isFile() && /\.ya?ml$/iu.test(entry.name)) result.push(path);
  }
  return result.sort();
}
