import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const sourceRoots = ['packages', 'apps', 'scripts'];
const sourceExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.mjs',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);
const forbiddenPatterns: readonly [string, RegExp][] = [
  ['dynamic eval', /\beval\s*\(/u],
  ['dynamic Function construction', /\bnew\s+Function\s*\(/u],
  ['raw HTML assignment', /\binnerHTML\s*=/u],
  ['private key material', /-----BEGIN [^-\r\n]+PRIVATE KEY-----/u],
];

const files = (await Promise.all(sourceRoots.map((sourceRoot) => walk(join(root, sourceRoot)))))
  .flat()
  .sort();
const failures: string[] = [];
for (const file of files) {
  if (!sourceExtensions.has(extname(file).toLowerCase())) continue;
  const contents = await readFile(file, 'utf8');
  for (const [label, pattern] of forbiddenPatterns) {
    if (pattern.test(contents)) failures.push(`${relative(root, file)}: ${label} pattern found`);
  }
}

for (const packageFile of await packageFiles()) {
  const contents = JSON.parse(await readFile(packageFile, 'utf8')) as {
    name?: unknown;
    license?: unknown;
    private?: unknown;
  };
  if (contents.private === true) continue;
  if (contents.license !== 'Apache-2.0') {
    failures.push(`${relative(root, packageFile)}: published packages must declare Apache-2.0`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`lint passed: ${files.length} source files inspected`);
}

async function packageFiles(): Promise<string[]> {
  const result = [join(root, 'package.json')];
  for (const directory of ['packages', 'apps']) {
    result.push(
      ...(await walk(join(root, directory))).filter((file) => file.endsWith('package.json')),
    );
  }
  return result.sort();
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    if (['.git', 'dist', 'node_modules'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(path)));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}
