import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';

const root = resolve(process.cwd());
const failures: string[] = [];
const packageFiles = [
  join(root, 'package.json'),
  ...(await walk(join(root, 'packages'))),
  ...(await walk(join(root, 'apps'))),
]
  .filter((file) => file.endsWith('package.json'))
  .sort();
const manifests = await Promise.all(
  packageFiles.map(async (file) => ({
    file,
    value: JSON.parse(await readFile(file, 'utf8')) as PackageManifest,
  })),
);
const lockText = await readFile(join(root, 'pnpm-lock.yaml'), 'utf8');
const lock = parse(lockText) as { lockfileVersion?: unknown; importers?: Record<string, unknown> };
if (typeof lock.lockfileVersion !== 'string' && typeof lock.lockfileVersion !== 'number')
  failures.push('pnpm-lock.yaml: missing lockfileVersion');
if (!lock.importers || typeof lock.importers !== 'object')
  failures.push('pnpm-lock.yaml: missing workspace importers');

for (const { file, value } of manifests) {
  const dependencies = {
    ...value.dependencies,
    ...value.devDependencies,
    ...value.optionalDependencies,
  };
  for (const [name, version] of Object.entries(dependencies)) {
    if (name.startsWith('@paperandslate/') && version !== 'workspace:*') {
      failures.push(`${file}: internal dependency ${name} must use workspace:*`);
    }
    if (/^(?:git\+|https?:|file:)/iu.test(version)) {
      failures.push(`${file}: dependency ${name} uses an unpinned external URL ${version}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `dependency check passed: ${packageFiles.length} workspace manifests use the committed pnpm lockfile`,
  );
}

interface PackageManifest {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
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
