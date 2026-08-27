import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { HOSTED_VALIDATION_STEPS } from './hosted-validation-commands.js';

const root = resolve(process.cwd());
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const corepackPnpmEntryPoint =
  process.platform === 'win32'
    ? join(dirname(process.execPath), 'node_modules', 'corepack', 'dist', 'pnpm.js')
    : undefined;

for (const step of HOSTED_VALIDATION_STEPS) {
  const args = [step.command, ...step.args];
  console.log(`\n==> pnpm ${args.join(' ')}`);
  const result =
    corepackPnpmEntryPoint && existsSync(corepackPnpmEntryPoint)
      ? spawnSync(process.execPath, [corepackPnpmEntryPoint, ...args], {
          cwd: root,
          env: { ...process.env, ...step.env },
          stdio: 'inherit',
        })
      : spawnSync(pnpmCommand, args, {
          cwd: root,
          env: { ...process.env, ...step.env },
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
