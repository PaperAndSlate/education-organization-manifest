import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import {
  mkdtemp,
  readFile,
  readdir,
  readFile as readFileAsync,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const root = resolve(process.cwd());
const packageDirectories = [
  ...(await readdir(join(root, 'packages'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, 'packages', entry.name)),
  join(root, 'apps', 'conformance-runner'),
];
const smokeRoot = await mkdtemp(join(tmpdir(), 'eom-package-smoke-'));
const packageTarballs = new Map<string, string>();
const packageNames: string[] = [];

try {
  for (const directory of packageDirectories.sort()) {
    const packageJson = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) as {
      name?: string;
      private?: boolean;
      exports?: Record<string, unknown>;
      files?: string[];
    };
    if (!packageJson.name || packageJson.private === true) continue;
    packageNames.push(packageJson.name);
    const exportsRoot = packageJson.exports?.['.'];
    if (
      !isRecord(exportsRoot) ||
      exportsRoot.import !== './dist/index.js' ||
      exportsRoot.types !== './dist/index.d.ts'
    ) {
      throw new Error(
        `${packageJson.name}: package exports must point to dist/index.js and dist/index.d.ts.`,
      );
    }
    const output = execFileSync('pnpm', ['pack', '--pack-destination', smokeRoot, '--json'], {
      cwd: directory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    const packed = JSON.parse(output) as {
      filename?: string;
      files?: readonly { path?: string }[];
    };
    if (!packed.filename)
      throw new Error(`${packageJson.name}: pnpm pack did not return a tarball.`);
    packageTarballs.set(packageJson.name, packed.filename);
    const entries =
      packed.files
        ?.map((entry) => entry.path)
        .filter((path): path is string => typeof path === 'string') ??
      readTarEntries(await readFileAsync(packed.filename));
    if (entries.some((entry) => entry.startsWith('src/')))
      throw new Error(`${packageJson.name}: packed source files are not allowed.`);
    if (!entries.includes('dist/index.js') || !entries.includes('dist/index.d.ts'))
      throw new Error(`${packageJson.name}: compiled runtime and declaration exports are missing.`);
    if (
      packageJson.name === '@paperandslate/eom-schema' &&
      !entries.includes('dist/schemas/1.0/catalog.json')
    )
      throw new Error('schema package: bundled schema catalog is missing.');
  }

  const dependencies = Object.fromEntries(packageTarballs.entries());
  const overrides = Object.fromEntries(packageTarballs.entries());
  await writeFile(
    join(smokeRoot, 'package.json'),
    `${JSON.stringify({ name: 'eom-clean-install-smoke', private: true, type: 'module', dependencies, pnpm: { overrides } }, null, 2)}\n`,
    'utf8',
  );
  execFileSync('pnpm', ['install', '--offline', '--ignore-scripts', '--no-frozen-lockfile'], {
    cwd: smokeRoot,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  const importScript = `const names = ${JSON.stringify(packageNames)}; for (const name of names) await import(name); console.log('clean package imports passed: ' + names.length);\n`;
  await writeFile(join(smokeRoot, 'runtime-smoke.mjs'), importScript, 'utf8');
  execFileSync(process.execPath, [join(smokeRoot, 'runtime-smoke.mjs')], {
    cwd: smokeRoot,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  const typeImports = packageNames
    .map(
      (name, index) =>
        `import type * as Package${index} from ${JSON.stringify(name)};\nconst package${index}: typeof Package${index} | undefined = undefined; void package${index};`,
    )
    .join('\n');
  await writeFile(join(smokeRoot, 'type-smoke.ts'), `${typeImports}\n`, 'utf8');
  execFileSync(
    process.execPath,
    [
      join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
      '--noEmit',
      '--strict',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--skipLibCheck',
      join(smokeRoot, 'type-smoke.ts'),
    ],
    { cwd: smokeRoot, encoding: 'utf8', stdio: 'inherit' },
  );
  console.log(`package smoke passed: ${packageNames.length} clean tarball installations`);
} finally {
  await rm(smokeRoot, { recursive: true, force: true });
}

function readTarEntries(bytes: Buffer): string[] {
  const tar = gunzipSync(bytes);
  const entries: string[] = [];
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/u, '');
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/u, '');
    const sizeText = header.subarray(124, 136).toString('ascii').replace(/\0.*$/u, '').trim();
    const size = sizeText ? Number.parseInt(sizeText, 8) : 0;
    entries.push(prefix ? `${prefix}/${name}` : name);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
