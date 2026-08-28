import { execFileSync } from 'node:child_process';
import { lstat, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { isJsonObject, parseStrictJson } from '@paperandslate/eom-core';
import { CLEAN_PACKAGE_INSTALL_ARGS } from './package-install-options.js';
import { pnpmInvocation } from './pnpm-runner.js';
import { readTarGz } from './tar.js';

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
const MAX_PACKAGE_JSON_BYTES = 1024 * 1024;

try {
  for (const directory of packageDirectories.sort()) {
    const packageJsonValue = parseStrictJson(
      await readBoundedText(join(directory, 'package.json'), `${directory}/package.json`),
      `${directory}/package.json`,
    );
    if (!isJsonObject(packageJsonValue)) {
      throw new Error(`${directory}/package.json must contain an object.`);
    }
    const packageJson = packageJsonValue as {
      name?: string;
      private?: boolean;
      exports?: Record<string, unknown>;
      files?: string[];
      scripts?: Record<string, unknown>;
    };
    if (!packageJson.name || packageJson.private === true) continue;
    const lifecycleScripts = [
      'prepublish',
      'prepare',
      'prepublishOnly',
      'publish',
      'postpublish',
      'prepack',
      'postpack',
    ];
    const configuredLifecycleScripts = lifecycleScripts.filter((name) =>
      Object.hasOwn(packageJson.scripts ?? {}, name),
    );
    if (configuredLifecycleScripts.length > 0) {
      throw new Error(
        `${packageJson.name}: lifecycle scripts are not permitted in release packages: ${configuredLifecycleScripts.join(', ')}`,
      );
    }
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
    const output = runPnpm(
      // pnpm pack has no --ignore-scripts option. Lifecycle scripts are
      // rejected above before packing, so the pack operation cannot execute
      // a release-package hook.
      ['pack', '--pack-destination', smokeRoot, '--json'],
      {
        cwd: directory,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const parsed = parseStrictJson(output.toString(), `${packageJson.name} pnpm pack output`);
    const packedValue = Array.isArray(parsed) ? parsed[0] : parsed;
    const packed = (isJsonObject(packedValue) ? packedValue : {}) as {
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
      readTarGz(await readFile(packed.filename)).map((entry) => entry.path);
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

  // Keep the consumer entirely local. Absolute Windows paths are interpreted
  // inconsistently by package managers, and pnpm 10 no longer reads the
  // package.json `pnpm.overrides` field. Relative file specs plus the
  // workspace-level overrides file work the same on every supported runner.
  const dependencies = Object.fromEntries(
    [...packageTarballs.entries()].map(([name, filename]) => [
      name,
      `file:./${basename(filename)}`,
    ]),
  );
  const overrides = [...packageTarballs.entries()]
    .map(
      ([name, filename]) =>
        `  ${JSON.stringify(name)}: ${JSON.stringify(`file:./${basename(filename)}`)}`,
    )
    .join('\n');
  await writeFile(
    join(smokeRoot, 'package.json'),
    `${JSON.stringify({ name: 'eom-clean-install-smoke', private: true, type: 'module', dependencies }, null, 2)}\n`,
    'utf8',
  );
  await writeFile(join(smokeRoot, 'pnpm-workspace.yaml'), `overrides:\n${overrides}\n`, 'utf8');
  runPnpm(CLEAN_PACKAGE_INSTALL_ARGS, {
    cwd: smokeRoot,
    encoding: 'utf8',
    stdio: 'inherit',
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function runPnpm(
  args: readonly string[],
  options: Parameters<typeof execFileSync>[2],
): Buffer | string {
  const invocation = pnpmInvocation(args);
  return execFileSync(invocation.command, invocation.args, options);
}

async function readBoundedText(path: string, label: string): Promise<string> {
  const information = await lstat(path);
  if (!information.isFile() || information.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file.`);
  }
  if (information.size > MAX_PACKAGE_JSON_BYTES) {
    throw new Error(`${label} exceeds the ${MAX_PACKAGE_JSON_BYTES}-byte safety limit.`);
  }
  const contents = await readFile(path, 'utf8');
  if (Buffer.byteLength(contents, 'utf8') > MAX_PACKAGE_JSON_BYTES) {
    throw new Error(`${label} exceeds the ${MAX_PACKAGE_JSON_BYTES}-byte safety limit.`);
  }
  return contents;
}
