import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync as readFileBytes } from 'node:fs';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const manifestPath = join(root, 'plans', 'pack-manifest.json');
const traceabilityPath = join(root, 'requirements', 'plan-file-traceability.json');
const matrixPath = join(root, 'requirements', 'TRACEABILITY_MATRIX.md');
const verificationPath = join(root, 'reports', 'verification', 'local-gates.json');
const failures: string[] = [];

const manifest = parseJson(await readFile(manifestPath, 'utf8'), manifestPath);
const traceability = parseJson(await readFile(traceabilityPath, 'utf8'), traceabilityPath);
const packageJson = parseJson(await readFile(join(root, 'package.json'), 'utf8'), 'package.json');
const manifestFiles = asArray(manifest.files);
const planEntries = asArray(traceability.planFiles);
const atomicEntries = asArray(traceability.atomicRequirements);
const traceabilitySource = isRecord(traceability.source) ? traceability.source : {};
const verification = await readOptionalJson(verificationPath);

if (!verification) {
  failures.push(
    'missing executable aggregate verification receipt reports/verification/local-gates.json',
  );
}

if (manifestFiles.length !== 194)
  failures.push(`planning-pack manifest must contain 194 files, found ${manifestFiles.length}`);
if (traceability.version !== 1) failures.push('traceability document version must be 1');
if (traceabilitySource.manifest !== 'plans/pack-manifest.json')
  failures.push('traceability source manifest is incorrect');
if (traceabilitySource.expectedFileCount !== manifestFiles.length)
  failures.push('traceability file count does not match the manifest');

const manifestByPath = new Map<string, Record<string, unknown>>();
for (const [index, value] of manifestFiles.entries()) {
  if (
    !isRecord(value) ||
    typeof value.path !== 'string' ||
    typeof value.bytes !== 'number' ||
    typeof value.sha256 !== 'string'
  ) {
    failures.push(`manifest file ${index} is malformed`);
    continue;
  }
  if (manifestByPath.has(value.path)) failures.push(`duplicate planning-pack path ${value.path}`);
  manifestByPath.set(value.path, value);
  const absolute = safeResolve(join('plans', value.path), `plans/${value.path}`);
  if (!absolute) continue;
  try {
    const bytes = await readFile(absolute);
    if (bytes.length !== value.bytes)
      failures.push(`${value.path}: planning file byte length changed`);
    if (sha256(bytes) !== value.sha256)
      failures.push(`${value.path}: planning file SHA-256 changed`);
  } catch {
    failures.push(`${value.path}: planning file is missing`);
  }
}

const ids = new Set<string>();
const planPaths = new Set<string>();
const scripts = isRecord(packageJson.scripts) ? packageJson.scripts : {};
if (verification) await checkVerificationReceipt(verification, scripts);
for (const [index, value] of planEntries.entries()) {
  if (!isRecord(value)) {
    failures.push(`traceability plan entry ${index} is not an object`);
    continue;
  }
  const id = stringValue(value.id);
  const planPath = stringValue(value.planPath);
  const classification = stringValue(value.classification);
  const status = stringValue(value.status);
  if (!id || !/^EOM-PLAN-\d{3}$/u.test(id))
    failures.push(`invalid plan requirement id at index ${index}`);
  if (id && ids.has(id)) failures.push(`duplicate traceability id ${id}`);
  if (id) ids.add(id);
  if (!planPath || !planPath.startsWith('plans/'))
    failures.push(`invalid plan path at ${id ?? index}`);
  if (planPath && planPaths.has(planPath))
    failures.push(`duplicate traceability plan path ${planPath}`);
  if (planPath) planPaths.add(planPath);
  if (
    !classification ||
    !['normative', 'implementation-guidance', 'reference'].includes(classification)
  )
    failures.push(`${id ?? index}: invalid classification`);
  if (!status || !['verified-local', 'blocked-external', 'open', 'not-applicable'].includes(status))
    failures.push(`${id ?? index}: invalid status`);
  if (status === 'open')
    failures.push(
      `${id ?? index}: local requirement remains open and cannot pass the aggregate gate`,
    );
  const manifestPathValue = planPath?.slice('plans/'.length);
  const source = manifestPathValue ? manifestByPath.get(manifestPathValue) : undefined;
  if (!source) failures.push(`${id ?? index}: plan path is not in the manifest`);
  if (source && value.planSha256 !== source.sha256)
    failures.push(`${id ?? index}: plan digest does not match manifest`);
  const evidencePaths = stringArray(value.evidencePaths, `${id ?? index}.evidencePaths`);
  const evidenceCommands = stringArray(value.evidenceCommands, `${id ?? index}.evidenceCommands`);
  for (const path of evidencePaths) await checkEvidencePath(path, id ?? String(index));
  for (const command of evidenceCommands)
    checkEvidenceCommand(command, scripts, id ?? String(index));
  if (status === 'verified-local') {
    for (const command of evidenceCommands)
      checkEvidenceExecution(command, verification, id ?? String(index));
  }
  if (
    status === 'verified-local' &&
    (evidencePaths.length === 0 || evidenceCommands.length === 0)
  ) {
    failures.push(`${id ?? index}: verified-local requires executable evidence paths and commands`);
  }
  if (status === 'blocked-external' && (!value.notes || typeof value.notes !== 'string')) {
    failures.push(`${id ?? index}: blocked-external requires an explicit blocker note`);
  }
  if (classification === 'reference' && status !== 'not-applicable')
    failures.push(`${id ?? index}: reference material must be not-applicable`);
  if (classification === 'implementation-guidance' && status !== 'not-applicable')
    failures.push(`${id ?? index}: implementation guidance must not claim local completion`);
}

if (planPaths.size !== manifestByPath.size)
  failures.push(
    `traceability covers ${planPaths.size} plan files, expected ${manifestByPath.size}`,
  );
for (const path of manifestByPath.keys())
  if (!planPaths.has(`plans/${path}`))
    failures.push(`missing traceability entry for plans/${path}`);

for (const [index, value] of atomicEntries.entries()) {
  if (!isRecord(value)) {
    failures.push(`atomic requirement ${index} is not an object`);
    continue;
  }
  const id = stringValue(value.id);
  const status = stringValue(value.status);
  if (!id || !/^EOM-(?:MOD-(?:AGG-)?\d{3}|NORM-\d{3}|REM-\d{3}|REL-(?:LOCAL|EXT)-\d{3})$/u.test(id))
    failures.push(`invalid atomic requirement id ${id ?? index}`);
  if (id && ids.has(id)) failures.push(`duplicate traceability id ${id}`);
  if (id) ids.add(id);
  if (!stringValue(value.requirement))
    failures.push(`${id ?? index}: requirement text is required`);
  const sources = stringArray(value.source, `${id ?? index}.source`);
  for (const source of sources) await checkSourcePath(source, id ?? String(index));
  if (sources.length === 0) failures.push(`${id ?? index}: at least one source is required`);
  if (!status || !['verified-local', 'blocked-external', 'open', 'not-applicable'].includes(status))
    failures.push(`${id ?? index}: invalid atomic status`);
  if (status === 'open')
    failures.push(
      `${id ?? index}: local requirement remains open and cannot pass the aggregate gate`,
    );
  const evidencePaths = stringArray(value.evidencePaths, `${id ?? index}.evidencePaths`);
  const evidenceCommands = stringArray(value.evidenceCommands, `${id ?? index}.evidenceCommands`);
  for (const path of evidencePaths) await checkEvidencePath(path, id ?? String(index));
  for (const command of evidenceCommands)
    checkEvidenceCommand(command, scripts, id ?? String(index));
  if (status === 'verified-local') {
    for (const command of evidenceCommands)
      checkEvidenceExecution(command, verification, id ?? String(index));
  }
  if (status === 'verified-local' && (evidencePaths.length === 0 || evidenceCommands.length === 0))
    failures.push(`${id ?? index}: verified-local requires executable evidence`);
  if (status === 'blocked-external' && (!stringValue(value.owner) || !stringValue(value.blocker)))
    failures.push(`${id ?? index}: blocked-external requires owner and blocker`);
}

const matrix = await readFile(matrixPath, 'utf8');
const matrixIds = [...matrix.matchAll(/^\|\s*(EOM-[A-Z0-9-]+)\s*\|/gmu)]
  .map((match) => match[1])
  .filter((id): id is string => id !== undefined);
if (new Set(matrixIds).size !== matrixIds.length)
  failures.push('traceability matrix contains duplicate requirement IDs');
if (!matrix.includes('EOM-MOD-AGG-001'))
  failures.push('traceability matrix must use EOM-MOD-AGG-001 for the module aggregate');
const expectedMatrixIds = [...ids].sort();
const actualMatrixIds = [...new Set(matrixIds)].sort();
if (
  expectedMatrixIds.length !== actualMatrixIds.length ||
  expectedMatrixIds.some((id, index) => id !== actualMatrixIds[index])
) {
  failures.push('traceability matrix IDs do not exactly match the generated requirement IDs');
}
if (matrix.includes('RC2 manifest') || matrix.includes('Final Standard workbench scan'))
  failures.push('current traceability matrix contains superseded RC2/formal-scan claims');

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `traceability check passed: ${manifestByPath.size} planning files and ${atomicEntries.length} atomic requirements\n`,
  );
}

function parseJson(text: string, path: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text);
    if (!isRecord(value)) throw new Error('expected an object');
    return value;
  } catch (error) {
    throw new Error(
      `${path}: invalid JSON (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

async function readOptionalJson(path: string): Promise<unknown> {
  try {
    const canonicalRoot = await realpath(root);
    const canonicalPath = await realpath(path);
    const canonicalRelative = relative(canonicalRoot, canonicalPath);
    if (
      canonicalRelative === '..' ||
      canonicalRelative.startsWith(`..${'\\'}`) ||
      canonicalRelative.startsWith('../')
    ) {
      throw new Error('path escapes the repository through a symbolic link');
    }
    const information = await lstat(path);
    if (information.isSymbolicLink()) throw new Error('symbolic-link paths are not permitted');
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch (error) {
    if (isNotFound(error)) return undefined;
    failures.push(
      `${path}: invalid aggregate verification JSON (${error instanceof Error ? error.message : String(error)})`,
    );
    return undefined;
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    failures.push(`${label} must be an array of strings`);
    return [];
  }
  return value;
}

async function checkEvidencePath(path: string, owner: string): Promise<void> {
  if (!(await repositoryPathIsBounded(path, `${owner} evidence path`))) {
    failures.push(`${owner}: missing evidence path ${path}`);
  }
}

async function checkSourcePath(path: string, owner: string): Promise<void> {
  const candidates = path.startsWith('plans/') ? [path] : [path, `plans/${path}`];
  for (const candidate of candidates) {
    if (await repositoryPathIsBounded(candidate, `${owner} source path`)) return;
  }
  failures.push(`${owner}: missing source path ${path}`);
}

async function repositoryPathIsBounded(path: string, label: string): Promise<boolean> {
  const absolute = safeResolve(path, label);
  if (!absolute) return false;
  try {
    const canonicalRoot = await realpath(root);
    const canonicalPath = await realpath(absolute);
    const canonicalRelative = relative(canonicalRoot, canonicalPath);
    if (
      canonicalRelative === '..' ||
      canonicalRelative.startsWith(`..${'\\'}`) ||
      canonicalRelative.startsWith('../')
    ) {
      failures.push(`${label}: path escapes the repository through a symbolic link`);
      return false;
    }
    const information = await lstat(absolute);
    if (information.isSymbolicLink()) {
      failures.push(`${label}: symbolic-link paths are not valid repository evidence`);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function checkVerificationReceipt(
  value: unknown,
  scripts: Record<string, unknown>,
): Promise<void> {
  if (!isRecord(value)) {
    failures.push('aggregate verification receipt must be a JSON object');
    return;
  }
  if (value.version !== 1 || value.status !== 'passed' || value.aggregateGate !== 'pnpm verify') {
    failures.push('aggregate verification receipt is not a passed pnpm verify receipt');
  }
  const sourceCommit = stringValue(value.sourceCommit);
  const sourceTree = stringValue(value.sourceTree);
  if (!sourceCommit || !/^[a-f0-9]{40}$/u.test(sourceCommit))
    failures.push('aggregate verification receipt has an invalid source commit');
  if (!sourceTree || !/^[a-f0-9]{40}$/u.test(sourceTree))
    failures.push('aggregate verification receipt has an invalid source tree');
  if (sourceCommit && sourceTree) {
    try {
      if (git('rev-parse', `${sourceCommit}^{tree}`) !== sourceTree)
        failures.push('aggregate verification receipt source commit/tree do not agree');
    } catch {
      failures.push(`aggregate verification source commit is not present: ${sourceCommit}`);
    }
  }
  const lockDigest = value.lockfileSha256;
  if (
    typeof lockDigest !== 'string' ||
    lockDigest !== sha256(readFileBytes(join(root, 'pnpm-lock.yaml')))
  )
    failures.push('aggregate verification receipt does not bind the current pnpm lockfile');
  const verifyScript = scripts.verify;
  if (
    typeof verifyScript !== 'string' ||
    value.aggregateScriptSha256 !== sha256(Buffer.from(verifyScript, 'utf8'))
  ) {
    failures.push('aggregate verification receipt does not bind the current verify script');
  }
  if (!Array.isArray(value.completedBeforeReceipt) || value.completedBeforeReceipt.length === 0)
    failures.push('aggregate verification receipt has no completed gate list');
  if (!Array.isArray(value.finalization) || value.finalization.length !== 3)
    failures.push('aggregate verification receipt has an incomplete finalization contract');
  const formalSecurityScan = value.formalSecurityScan;
  if (!isRecord(formalSecurityScan)) {
    failures.push('aggregate verification receipt does not record the formal security scan');
  } else {
    if (
      formalSecurityScan.version !== 1 ||
      formalSecurityScan.status !== 'pass' ||
      typeof formalSecurityScan.scanId !== 'string' ||
      typeof formalSecurityScan.targetCommit !== 'string' ||
      typeof formalSecurityScan.targetTree !== 'string' ||
      formalSecurityScan.unresolvedFindingCount !== 0
    ) {
      failures.push('aggregate verification receipt has an invalid formal security scan record');
    } else if (
      git('rev-parse', `${formalSecurityScan.targetCommit}^{tree}`) !==
      formalSecurityScan.targetTree
    ) {
      failures.push('aggregate verification receipt formal security scan target is inconsistent');
    } else if (formalSecurityScan.targetTree !== sourceTree) {
      failures.push(
        'aggregate verification receipt formal security scan does not target the aggregate source tree',
      );
    }
    const securityReport = await readOptionalJson(join(root, 'reports', 'security-scan.json'));
    if (!isRecord(securityReport)) {
      failures.push('formal security scan report is missing');
    } else if (
      securityReport.scanId !== formalSecurityScan.scanId ||
      securityReport.targetCommit !== formalSecurityScan.targetCommit ||
      securityReport.targetTree !== formalSecurityScan.targetTree ||
      securityReport.unresolvedFindingCount !== 0
    ) {
      failures.push('formal security scan report does not match the aggregate receipt');
    }
  }
}

function checkEvidenceCommand(
  command: string,
  scripts: Record<string, unknown>,
  owner: string,
): void {
  const match = /^pnpm\s+([A-Za-z0-9:_-]+)/u.exec(command);
  if (!match?.[1] || typeof scripts[match[1]] !== 'string')
    failures.push(`${owner}: evidence command is not a root package script: ${command}`);
}

function checkEvidenceExecution(command: string, receipt: unknown, owner: string): void {
  if (!isRecord(receipt) || receipt.status !== 'passed') {
    failures.push(
      `${owner}: verified-local evidence has no passed aggregate receipt for ${command}`,
    );
    return;
  }
  if (commandKey(command) === 'verify') return;
  const completed = Array.isArray(receipt.completedBeforeReceipt)
    ? receipt.completedBeforeReceipt
        .filter(
          (entry): entry is Record<string, unknown> =>
            isRecord(entry) && entry.status === 'passed' && typeof entry.command === 'string',
        )
        .map((entry) => commandKey(entry.command as string))
    : [];
  if (!completed.includes(commandKey(command))) {
    failures.push(`${owner}: evidence command was not recorded as passed: ${command}`);
  }
}

function commandKey(command: string): string {
  const match = /^pnpm\s+([A-Za-z0-9:_-]+)/u.exec(command.trim());
  return match?.[1] ?? command.trim();
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).replace(/(?:\r?\n)+$/u, '');
}

function safeResolve(path: string, label: string): string | undefined {
  const absolute = resolve(root, path);
  const relativePath = relative(root, absolute);
  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${'\\'}`) ||
    relativePath.startsWith('../')
  ) {
    failures.push(`${label}: path escapes the repository`);
    return undefined;
  }
  return absolute;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
