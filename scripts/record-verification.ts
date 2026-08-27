import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const receiptPath = join(root, 'reports', 'verification', 'local-gates.json');
const packagePath = join(root, 'package.json');
const lockfilePath = join(root, 'pnpm-lock.yaml');

const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as {
  scripts?: Record<string, unknown>;
};
const verifyScript = packageJson.scripts?.verify;
if (typeof verifyScript !== 'string' || verifyScript.length === 0) {
  throw new Error(
    'package.json must define the aggregate verify script before recording evidence.',
  );
}

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
  .filter(
    (path) => path !== 'reports/verification/local-gates.json' && !path.startsWith('release/'),
  );
if (dirtySourcePaths.length > 0) {
  throw new Error(
    `Aggregate verification requires a clean committed source tree before recording evidence: ${dirtySourcePaths.join(', ')}`,
  );
}

const commands = verifyScript.split(' && ');
const receipt = {
  version: 1,
  status: 'passed',
  aggregateGate: 'pnpm verify',
  sourceCommit,
  sourceTree,
  lockfileSha256: sha256(await readFile(lockfilePath)),
  aggregateScriptSha256: sha256(Buffer.from(verifyScript, 'utf8')),
  completedBeforeReceipt: commands.slice(0, -3).map((command) => ({ command, status: 'passed' })),
  finalization: [
    { command: 'pnpm verify:record', status: 'passed' },
    { command: 'pnpm generate:traceability', status: 'executed-after-record' },
    { command: 'pnpm traceability:check', status: 'required-next' },
  ],
  policy:
    'This receipt is written only by the final segment of pnpm verify; traceability:check remains the final pass/fail decision.',
};

await mkdir(join(root, 'reports', 'verification'), { recursive: true });
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(`recorded aggregate verification evidence for ${sourceCommit}`);

async function readReleaseIdentity(): Promise<
  { readonly sourceCommit: string; readonly sourceTree: string } | undefined
> {
  try {
    const value = JSON.parse(await readFile(join(root, 'release', 'manifest.json'), 'utf8')) as {
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

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).replace(/(?:\r?\n)+$/u, '');
}

function isCommit(value: string): boolean {
  return /^[a-f0-9]{40}$/u.test(value);
}

function sourceTreeMatchesWorkingSource(sourceTree: string): boolean {
  try {
    execFileSync('git', ['diff', '--quiet', sourceTree, '--', '.', ':(exclude)release/**'], {
      cwd: root,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
