import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
for (const script of ['scripts/generate-types.ts', 'scripts/generate-schema-docs.ts']) {
  const result = spawnSync(process.execPath, [tsxEntrypoint, script, '--check'], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
