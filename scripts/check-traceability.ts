import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const manifestPath = join(root, 'plans', 'pack-manifest.json');
const traceabilityPath = join(root, 'requirements', 'plan-file-traceability.json');
const matrixPath = join(root, 'requirements', 'TRACEABILITY_MATRIX.md');
const failures: string[] = [];

const manifest = parseJson(await readFile(manifestPath, 'utf8'), manifestPath);
const traceability = parseJson(await readFile(traceabilityPath, 'utf8'), traceabilityPath);
const packageJson = parseJson(await readFile(join(root, 'package.json'), 'utf8'), 'package.json');
const manifestFiles = asArray(manifest.files);
const planEntries = asArray(traceability.planFiles);
const atomicEntries = asArray(traceability.atomicRequirements);
const traceabilitySource = isRecord(traceability.source) ? traceability.source : {};

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
  const absolute = safeResolve(path, `${owner} evidence path`);
  if (!absolute) return;
  try {
    await access(absolute);
  } catch {
    failures.push(`${owner}: missing evidence path ${path}`);
  }
}

async function checkSourcePath(path: string, owner: string): Promise<void> {
  const candidates = path.startsWith('plans/') ? [path] : [path, `plans/${path}`];
  for (const candidate of candidates) {
    const absolute = safeResolve(candidate, `${owner} source path`);
    if (!absolute) continue;
    try {
      await access(absolute);
      return;
    } catch {
      // Plan-relative source references are accepted only after safe resolution
      // confirms that they stay inside this repository.
    }
  }
  failures.push(`${owner}: missing source path ${path}`);
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
