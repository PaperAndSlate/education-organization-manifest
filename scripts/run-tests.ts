import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vitest = join(root, 'node_modules', 'vitest', 'vitest.mjs');
const forwarded = process.argv.slice(2).filter((argument) => argument !== '--runInBand');
const result = spawnSync(process.execPath, [vitest, 'run', ...forwarded], {
  cwd: root,
  stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
