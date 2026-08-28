import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { HOSTED_VALIDATION_STEPS } from './hosted-validation-commands.js';
import { pnpmInvocation } from './pnpm-runner.js';
import { safeChildEnvironment } from './safe-child-env.js';

const root = resolve(process.cwd());

for (const step of HOSTED_VALIDATION_STEPS) {
  const args = [step.command, ...step.args];
  console.log(`\n==> pnpm ${args.join(' ')}`);
  const invocation = pnpmInvocation(args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: root,
    env: safeChildEnvironment(step.env),
    stdio: 'inherit',
  });
  if (result.error) {
    throw new Error(`pnpm ${args.join(' ')} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
