import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { AGGREGATE_VERIFY_GATES } from './verify-gates.js';
import { pnpmInvocation } from './pnpm-runner.js';
import { safeChildEnvironment } from './safe-child-env.js';

const root = resolve(process.cwd());
const temporaryRoot = await mkdtemp(join(tmpdir(), 'eom-verify-run-'));
const runFile = join(temporaryRoot, 'run.json');
const token = randomBytes(32).toString('hex');
const run = {
  version: 1,
  status: 'running' as 'running' | 'passed',
  tokenDigest: sha256(token),
  gates: [] as { command: string; status: 'passed' }[],
};

try {
  await writeRun();
  for (const gate of AGGREGATE_VERIFY_GATES) {
    const invocation = pnpmInvocation(gate.args);
    execFileSync(invocation.command, invocation.args, {
      cwd: root,
      env: safeChildEnvironment(),
      stdio: 'inherit',
    });
    run.gates.push({ command: gate.command, status: 'passed' });
    await writeRun();
  }
  run.status = 'passed';
  await writeRun();
  const recordInvocation = pnpmInvocation(['verify:record']);
  execFileSync(recordInvocation.command, recordInvocation.args, {
    cwd: root,
    env: safeChildEnvironment({ EOM_VERIFY_RUN_FILE: runFile, EOM_VERIFY_RUN_TOKEN: token }),
    stdio: 'inherit',
  });
  const generateInvocation = pnpmInvocation(['generate:traceability']);
  execFileSync(generateInvocation.command, generateInvocation.args, {
    cwd: root,
    env: safeChildEnvironment(),
    stdio: 'inherit',
  });
  const traceabilityInvocation = pnpmInvocation(['traceability:check']);
  execFileSync(traceabilityInvocation.command, traceabilityInvocation.args, {
    cwd: root,
    env: safeChildEnvironment(),
    stdio: 'inherit',
  });
  process.stdout.write('aggregate verification passed with authoritative finalization\n');
} catch (error) {
  process.stderr.write(
    `aggregate verification failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function writeRun(): Promise<void> {
  await writeFile(runFile, `${JSON.stringify(run, null, 2)}\n`, { encoding: 'utf8' });
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
