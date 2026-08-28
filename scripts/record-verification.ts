import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { basename, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { isJsonObject, parseStrictJson } from '@paperandslate/eom-core';
import {
  readSecurityScanEvidence,
  type SecurityScanArtifactDigests,
} from './security-scan-evidence.js';
import { AGGREGATE_VERIFY_GATES } from './verify-gates.js';
import { atomicWriteFile, ensureRealDirectoryTree } from './atomic-write.js';

const root = resolve(process.cwd());
const receiptPath = join(root, 'reports', 'verification', 'local-gates.json');
const packagePath = join(root, 'package.json');
const lockfilePath = join(root, 'pnpm-lock.yaml');
const runFilePath = process.env.EOM_VERIFY_RUN_FILE;
const runToken = process.env.EOM_VERIFY_RUN_TOKEN;

if (!runFilePath || !runToken) {
  throw new Error(
    'verify:record is internal to pnpm verify and cannot be invoked directly; run pnpm verify instead.',
  );
}

const packageJsonValue = parseStrictJson(await readFile(packagePath, 'utf8'), 'package.json');
if (!isJsonObject(packageJsonValue)) throw new Error('package.json must contain an object.');
const packageJson = packageJsonValue as {
  scripts?: Record<string, unknown>;
};
const verifyScript = packageJson.scripts?.verify;
if (typeof verifyScript !== 'string' || verifyScript.length === 0) {
  throw new Error(
    'package.json must define the aggregate verify script before recording evidence.',
  );
}

const verificationRun = await readVerificationRun(runFilePath, runToken);

const head = git('rev-parse', 'HEAD');
const releaseIdentity = await readReleaseIdentity();
const sourceCommit = releaseIdentity?.sourceCommit ?? head;
const sourceTree = releaseIdentity?.sourceTree ?? git('rev-parse', `${sourceCommit}^{tree}`);
if (!isCommit(sourceCommit) || !isCommit(sourceTree)) {
  throw new Error('Verification evidence requires a full source commit and tree identifier.');
}
if (git('rev-parse', `${sourceCommit}^{tree}`) !== sourceTree) {
  throw new Error('The verification source commit does not resolve to the recorded source tree.');
}
const dirtySourcePaths = git('status', '--porcelain=v1', '--untracked-files=all')
  .split(/\r?\n/u)
  .filter(Boolean)
  .map((line) => line.slice(3).trim().replace(/^"|"$/gu, '').replaceAll('\\', '/'))
  .filter((path) => !isGeneratedEvidencePath(path) && !path.startsWith('release/'));
if (dirtySourcePaths.length > 0) {
  throw new Error(
    `Aggregate verification requires a clean committed source tree before recording evidence: ${dirtySourcePaths.join(', ')}`,
  );
}

const formalSecurityScan = await readFormalSecurityScan(sourceTree);
const receipt = {
  version: 1,
  status: 'passed',
  aggregateGate: 'pnpm verify',
  sourceCommit,
  sourceTree,
  lockfileSha256: sha256(await readFile(lockfilePath)),
  aggregateScriptSha256: sha256(Buffer.from(verifyScript, 'utf8')),
  formalSecurityScan,
  completedBeforeReceipt: verificationRun.gates,
  finalization: [
    { command: 'pnpm verify:record', status: 'passed' },
    { command: 'pnpm generate:traceability', status: 'executed-after-record' },
    { command: 'pnpm traceability:check', status: 'required-next' },
  ],
  policy:
    'This receipt is written only after the explicit aggregate gate runner completes every declared command; traceability:check remains the final pass/fail decision.',
};

const reportsRoot = join(root, 'reports');
await ensureRealDirectoryTree(reportsRoot);
const verificationRoot = join(reportsRoot, 'verification');
await ensureRealDirectoryTree(verificationRoot);
await atomicWriteFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`recorded aggregate verification evidence for ${sourceCommit}`);

async function readReleaseIdentity(): Promise<
  { readonly sourceCommit: string; readonly sourceTree: string } | undefined
> {
  try {
    const parsed = parseStrictJson(
      await readFile(join(root, 'release', 'manifest.json'), 'utf8'),
      'release/manifest.json',
    );
    if (!isJsonObject(parsed)) return undefined;
    const value = parsed as {
      sourceCommit?: unknown;
      sourceTree?: unknown;
    };
    if (
      typeof value.sourceCommit === 'string' &&
      typeof value.sourceTree === 'string' &&
      isCommit(value.sourceCommit) &&
      isCommit(value.sourceTree) &&
      git('rev-parse', `${value.sourceCommit}^{tree}`) === value.sourceTree &&
      sourceTreeMatchesWorkingSource(value.sourceTree)
    ) {
      return { sourceCommit: value.sourceCommit, sourceTree: value.sourceTree };
    }
  } catch {
    // A release packet is optional while the aggregate source gates are bootstrapped.
  }
  return undefined;
}

async function readVerificationRun(
  path: string,
  token: string,
): Promise<{
  readonly gates: readonly { readonly command: string; readonly status: 'passed' }[];
}> {
  let parsed: unknown;
  try {
    await assertRunnerHandoffPath(path);
    parsed = parseStrictJson(await readFile(path, 'utf8'), path);
  } catch (error) {
    throw new Error(
      `verify:record requires a valid runner handoff: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isJsonObject(parsed)) throw new Error('verify:record runner handoff must be an object.');
  if (
    parsed.version !== 1 ||
    parsed.status !== 'passed' ||
    parsed.tokenDigest !== sha256(Buffer.from(token, 'utf8'))
  ) {
    throw new Error('verify:record runner handoff is invalid or was not completed by pnpm verify.');
  }
  if (!Array.isArray(parsed.gates))
    throw new Error('verify:record runner handoff has no gate list.');
  const gates = parsed.gates.map((value, index) => {
    if (!isJsonObject(value) || typeof value.command !== 'string' || value.status !== 'passed') {
      throw new Error(`verify:record runner handoff gate ${index} is not a passed command.`);
    }
    return { command: value.command, status: 'passed' as const };
  });
  const expected = AGGREGATE_VERIFY_GATES.map((gate) => gate.command);
  if (
    gates.length !== expected.length ||
    gates.some((gate, index) => gate.command !== expected[index])
  ) {
    throw new Error('verify:record runner handoff does not contain the exact aggregate gate list.');
  }
  return { gates };
}

async function assertRunnerHandoffPath(path: string): Promise<void> {
  const resolvedPath = resolve(path);
  if (basename(resolvedPath) !== 'run.json') {
    throw new Error('verify:record runner handoff must use the generated run.json filename.');
  }
  const parent = resolve(resolvedPath, '..');
  if (!/^eom-verify-run-[^\\/]+$/u.test(basename(parent))) {
    throw new Error('verify:record runner handoff must be in a generated temporary run directory.');
  }
  const temporaryRoot = await realpath(tmpdir());
  const canonicalParent = await realpath(parent);
  const suffix = relative(temporaryRoot, canonicalParent);
  if (
    suffix === '..' ||
    suffix.startsWith(`..${'\\'}`) ||
    suffix.startsWith('../') ||
    (process.platform === 'win32' &&
      !canonicalParent.toLowerCase().startsWith(temporaryRoot.toLowerCase()))
  ) {
    throw new Error('verify:record runner handoff must remain under the OS temporary directory.');
  }
  const parentInformation = await lstat(parent);
  if (!parentInformation.isDirectory() || parentInformation.isSymbolicLink()) {
    throw new Error('verify:record runner handoff directory must be a real temporary directory.');
  }
  const information = await lstat(resolvedPath);
  if (!information.isFile() || information.isSymbolicLink()) {
    throw new Error('verify:record runner handoff must be a regular file.');
  }
  if (information.size > 1024 * 1024) {
    throw new Error('verify:record runner handoff exceeds its 1 MiB safety limit.');
  }
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).replace(/(?:\r?\n)+$/u, '');
}

function isCommit(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
}

async function readFormalSecurityScan(sourceTree: string): Promise<{
  readonly version: 1;
  readonly status: 'pass';
  readonly scanId: string;
  readonly targetCommit: string;
  readonly targetTree: string;
  readonly targetId: string;
  readonly unresolvedFindingCount: 0;
  readonly canonicalArtifacts: SecurityScanArtifactDigests;
  readonly producer: { readonly name: string; readonly version: string };
}> {
  let evidence;
  try {
    evidence = await readSecurityScanEvidence(root);
  } catch (error) {
    throw new Error(
      `Aggregate verification requires sealed formal security scan evidence: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (git('rev-parse', `${evidence.targetCommit}^{tree}`) !== evidence.targetTree) {
    throw new Error('Formal security scan targetCommit and targetTree do not agree.');
  }
  if (evidence.targetTree !== sourceTree) {
    throw new Error(
      'Formal security scan must target the exact source tree used for aggregate verification.',
    );
  }
  return {
    version: 1,
    status: 'pass',
    scanId: evidence.scanId,
    targetCommit: evidence.targetCommit,
    targetTree: evidence.targetTree,
    targetId: evidence.targetId,
    unresolvedFindingCount: 0,
    canonicalArtifacts: evidence.artifacts,
    producer: evidence.producer,
  };
}

function sourceTreeMatchesWorkingSource(sourceTree: string): boolean {
  try {
    execFileSync(
      'git',
      [
        'diff',
        '--quiet',
        sourceTree,
        '--',
        '.',
        ':(exclude)release/**',
        ...generatedEvidencePathspecs(),
      ],
      { cwd: root, stdio: 'ignore' },
    );
    return true;
  } catch {
    return false;
  }
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isGeneratedEvidencePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/').replace(/^"|"$/gu, '');
  return generatedEvidencePaths().some(
    (candidate) => normalized === candidate || normalized.startsWith(`${candidate}/`),
  );
}

function generatedEvidencePaths(): readonly string[] {
  return [
    'reports/remediation-audit.md',
    'reports/release-checklist.md',
    'reports/security-scan.md',
    'reports/security-scan.json',
    'reports/security-scan',
    'reports/verification/local-gates.json',
    'reports/verification/traceability-result.json',
    'requirements/TRACEABILITY_MATRIX.md',
    'requirements/plan-file-traceability.json',
  ];
}

function generatedEvidencePathspecs(): readonly string[] {
  return generatedEvidencePaths().map((path) =>
    path === 'reports/security-scan' ? ':(exclude)reports/security-scan/**' : `:(exclude)${path}`,
  );
}
