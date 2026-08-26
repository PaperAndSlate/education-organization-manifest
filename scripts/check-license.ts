import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const failures: string[] = [];
const reuse = await readFile(join(root, 'REUSE.toml'), 'utf8');
if (!reuse.includes('SPDX-License-Identifier = "Apache-2.0"'))
  failures.push('REUSE.toml: missing Apache-2.0 annotation');
if (!reuse.includes('SPDX-License-Identifier = "CC-BY-4.0"'))
  failures.push('REUSE.toml: missing CC-BY-4.0 documentation annotation');
if (!reuse.includes('SPDX-License-Identifier = "CC0-1.0"'))
  failures.push('REUSE.toml: missing CC0-1.0 fixture annotation');

const packageFiles = [
  join(root, 'package.json'),
  ...(await walk(join(root, 'packages'))),
  ...(await walk(join(root, 'apps'))),
]
  .filter((file) => file.endsWith('package.json'))
  .sort();
for (const file of packageFiles) {
  const packageJson = JSON.parse(await readFile(file, 'utf8')) as {
    private?: boolean;
    license?: string;
  };
  if (packageJson.private !== true && packageJson.license !== 'Apache-2.0') {
    failures.push(`${file}: published package must use Apache-2.0`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `license check passed: ${packageFiles.length} package manifests and REUSE metadata inspected`,
  );
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    if (['dist', 'node_modules'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(path)));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}
