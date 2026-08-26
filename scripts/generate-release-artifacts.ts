import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { parseStrictJson, stringifyCanonical } from '@paperandslate/eom-core';

const root = resolve(process.cwd());
const releaseVersion = '1.0.0-rc.1';
const candidateDirectory = join(root, 'release', `v${releaseVersion}`);
const sourceDateEpoch = Number(process.env.SOURCE_DATE_EPOCH ?? '0');
if (!Number.isInteger(sourceDateEpoch) || sourceDateEpoch < 0) {
  throw new Error('SOURCE_DATE_EPOCH must be a non-negative integer.');
}
const generatedAt = new Date(sourceDateEpoch * 1000).toISOString();

await rm(candidateDirectory, { recursive: true, force: true });
await mkdir(candidateDirectory, { recursive: true });
await cp(join(root, 'spec', '1.0'), join(candidateDirectory, 'spec', '1.0'), { recursive: true });
await cp(join(root, 'schemas', '1.0'), join(candidateDirectory, 'schemas', '1.0'), {
  recursive: true,
});
await cp(
  join(root, 'mappings', 'registry.json'),
  join(candidateDirectory, 'mappings', 'registry.json'),
  {
    recursive: true,
  },
);
await writeFile(
  join(candidateDirectory, 'STATUS.md'),
  [
    `# EOM ${releaseVersion}`,
    '',
    'This is a reproducible release-candidate artifact for the EOM 1.0 working draft.',
    'The proposed well-known URI suffix is not claimed as IANA-registered.',
    'Independent pilots, legal review, external certification, and production deployment remain external gates.',
    '',
    `Source date epoch: ${sourceDateEpoch} (${generatedAt})`,
    '',
  ].join('\n'),
  'utf8',
);

const archiveEntries = await sourceArchiveEntries();
const archiveBytes = createTarGz(archiveEntries);
const archivePath = join(
  root,
  'release',
  `educational-organization-manifest-${releaseVersion}.tar.gz`,
);
await writeFile(archivePath, archiveBytes);

const packageManifests = await readPackageManifests();
const lockBytes = await readFile(join(root, 'pnpm-lock.yaml'));
const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: 'urn:uuid:00000000-0000-4000-8000-000000000001',
  version: 1,
  metadata: {
    timestamp: generatedAt,
    tools: [{ vendor: 'paper&slate', name: 'eom-release-tooling', version: '0.1.0' }],
    properties: [
      { name: 'eom.release', value: releaseVersion },
      { name: 'eom.sourceDateEpoch', value: String(sourceDateEpoch) },
      { name: 'eom.pnpmLockSha256', value: sha256(lockBytes) },
    ],
  },
  components: packageManifests,
};
const sbomPath = join(root, 'release', 'sbom.cdx.json');
await writeFile(sbomPath, stringifyCanonical(sbom as never), 'utf8');

const provenance = {
  _type: 'https://in-toto.io/Statement/v1',
  subject: [
    {
      name: `educational-organization-manifest-${releaseVersion}.tar.gz`,
      digest: { sha256: sha256(archiveBytes) },
    },
  ],
  predicateType: 'https://slsa.dev/provenance/v1',
  predicate: {
    buildDefinition: {
      buildType: 'https://paperandslate.org/eom/build/reproducible-source-archive/v1',
      externalParameters: { releaseVersion, sourceDateEpoch },
      internalParameters: {
        specification: 'https://paperandslate.org/spec/eom/1.0',
        packageManager: 'pnpm@10.6.0',
      },
      resolvedDependencies: [{ uri: 'file:pnpm-lock.yaml', digest: { sha256: sha256(lockBytes) } }],
    },
    runDetails: {
      builder: { id: 'https://paperandslate.org/eom/local-release-tooling' },
      metadata: { startedOn: generatedAt, finishedOn: generatedAt, reproducible: true },
    },
  },
  provenanceStatus: 'local metadata; not a signed external attestation',
};
const provenancePath = join(root, 'release', 'build-provenance.json');
await writeFile(provenancePath, stringifyCanonical(provenance as never), 'utf8');

const candidateFiles = await filesWithBytes(candidateDirectory);
const releaseArtifacts = [
  ...candidateFiles.map((file) => ({
    path: `v${releaseVersion}/${file.relativePath}`,
    bytes: file.bytes,
  })),
  { path: `educational-organization-manifest-${releaseVersion}.tar.gz`, bytes: archiveBytes },
  { path: 'sbom.cdx.json', bytes: await readFile(sbomPath) },
  { path: 'build-provenance.json', bytes: await readFile(provenancePath) },
];
const checksums =
  releaseArtifacts
    .map((artifact) => `${sha256(artifact.bytes)}  ${artifact.path}`)
    .sort()
    .join('\n') + '\n';
const checksumsPath = join(root, 'release', 'checksums.sha256');
await writeFile(checksumsPath, checksums, 'utf8');

const manifest = {
  release: releaseVersion,
  channel: 'release-candidate',
  protocolStatus: 'working-draft',
  generatedAt,
  sourceDateEpoch,
  specification: 'https://paperandslate.org/spec/eom/1.0',
  schemaBase: 'https://paperandslate.org/schemas/eom/1.0/',
  artifacts: releaseArtifacts
    .concat({ path: 'checksums.sha256', bytes: Buffer.from(checksums, 'utf8') })
    .map((artifact) => ({
      path: artifact.path,
      bytes: artifact.bytes.length,
      sha256: sha256(artifact.bytes),
    }))
    .sort((left, right) => left.path.localeCompare(right.path)),
  externalGates: {
    ianaRegistration: 'blocked-external',
    independentPublisherConsumerPilot: 'blocked-external',
    legalLicenseReview: 'pending-external',
    productionDeployment: 'not-authorized',
  },
  claimsPolicy:
    'No registration, certification, adoption, legal approval, factual verification, or deployment is claimed by these artifacts.',
};
await writeFile(
  join(root, 'release', 'manifest.json'),
  stringifyCanonical(manifest as never),
  'utf8',
);

console.log(
  `prepared ${releaseVersion}: ${releaseArtifacts.length + 1} checksummed artifacts, ${archiveBytes.length} archive bytes, source date epoch ${sourceDateEpoch}`,
);

interface ArchiveEntry {
  readonly path: string;
  readonly bytes: Buffer;
}

interface ReleaseFile {
  readonly relativePath: string;
  readonly bytes: Buffer;
}

async function sourceArchiveEntries(): Promise<ArchiveEntry[]> {
  const roots = [
    '.github',
    'apps',
    'candidates',
    'docs',
    'evidence',
    'fixtures',
    'mappings',
    'modules',
    'packages',
    'plans',
    'prompts',
    'requirements',
    'schemas',
    'vocabularies',
    'scripts',
    'sources',
    'spec',
    'tests',
  ];
  const rootFiles = [
    '.editorconfig',
    '.gitattributes',
    '.gitignore',
    '.npmrc',
    '.nvmrc',
    '.prettierignore',
    'AGENTS.md',
    'CHANGELOG.md',
    'CODE_OF_CONDUCT.md',
    'CONTRIBUTING.md',
    'GOVERNANCE.md',
    'LICENSE',
    'README.md',
    'REUSE.toml',
    'SECURITY.md',
    'eslint.config.mjs',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'prettier.config.mjs',
    'tsconfig.json',
    'turbo.json',
    'vitest.config.ts',
  ];
  const paths = [
    ...rootFiles.map((file) => join(root, file)),
    ...(await Promise.all(roots.map((directory) => walk(join(root, directory))))).flat(),
  ]
    .filter((path) => isArchivePath(relative(root, path)))
    .sort((left, right) => relative(root, left).localeCompare(relative(root, right)));
  const entries: ArchiveEntry[] = [];
  for (const path of paths) {
    const relativePath = relative(root, path).replaceAll('\\', '/');
    entries.push({
      path: `educational-organization-manifest-${releaseVersion}/${relativePath}`,
      bytes: await readFile(path),
    });
  }
  return entries;
}

function isArchivePath(path: string): boolean {
  const parts = path.replaceAll('\\', '/').split('/');
  if (parts.some((part) => ['.git', 'dist', 'node_modules', 'generated', 'build'].includes(part)))
    return false;
  if (path.startsWith('docs/goals/')) return false;
  if (path.startsWith('release/')) return false;
  return extname(path) !== '.log';
}

async function filesWithBytes(directory: string): Promise<ReleaseFile[]> {
  const paths = await walk(directory);
  const files: ReleaseFile[] = [];
  for (const path of paths) {
    files.push({
      relativePath: relative(directory, path).replaceAll('\\', '/'),
      bytes: await readFile(path),
    });
  }
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function readPackageManifests(): Promise<readonly Record<string, unknown>[]> {
  const paths = [
    join(root, 'package.json'),
    ...(await walk(join(root, 'packages'))),
    ...(await walk(join(root, 'apps'))),
  ]
    .filter((path) => path.endsWith('package.json'))
    .sort();
  const components = new Map<string, Record<string, unknown>>();
  for (const path of paths) {
    const value = JSON.parse(await readFile(path, 'utf8')) as {
      name?: string;
      version?: string;
      license?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    if (!value.name || !value.version) continue;
    components.set(value.name, {
      type: 'library',
      group: value.name.startsWith('@') ? value.name.split('/')[0]?.slice(1) : undefined,
      name: value.name.startsWith('@') ? value.name.split('/')[1] : value.name,
      version: value.version,
      scope: value.name.startsWith('@') ? 'required' : 'optional',
      purl: `pkg:npm/${value.name}@${value.version}`,
      licenses: value.license ? [{ license: { id: value.license } }] : undefined,
    });
    for (const [dependency, requested] of Object.entries({
      ...value.dependencies,
      ...value.devDependencies,
    })) {
      if (dependency.startsWith('@paperandslate/')) continue;
      if (!components.has(dependency)) {
        components.set(dependency, {
          type: 'library',
          name: dependency,
          version: requested,
          scope: 'required',
          purl: `pkg:npm/${dependency}@${requested.replace(/^[~^>=< ]+/u, '')}`,
        });
      }
    }
  }
  return [...components.values()].sort((left, right) =>
    String(left.purl).localeCompare(String(right.purl)),
  );
}

function createTarGz(entries: readonly ArchiveEntry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    blocks.push(tarHeader(entry.path, entry.bytes.length));
    blocks.push(entry.bytes);
    const padding = (512 - (entry.bytes.length % 512)) % 512;
    if (padding > 0) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks), { level: 9 });
}

function tarHeader(path: string, size: number): Buffer {
  const header = Buffer.alloc(512, 0);
  const slash = path.lastIndexOf('/');
  const name = path.length <= 100 ? path : path.slice(slash + 1);
  const prefix = path.length <= 100 ? '' : path.slice(0, slash);
  if (name.length > 100 || prefix.length > 155)
    throw new Error(`Archive path is too long: ${path}`);
  writeTarField(header, 0, 100, name);
  writeTarField(header, 100, 8, '0000644\0');
  writeTarField(header, 108, 8, '0000000\0');
  writeTarField(header, 116, 8, '0000000\0');
  writeTarField(header, 124, 12, `${size.toString(8).padStart(11, '0')}\0`);
  writeTarField(header, 136, 12, '00000000000\0');
  writeTarField(header, 148, 8, '        ');
  writeTarField(header, 156, 1, '0');
  writeTarField(header, 257, 6, 'ustar\0');
  writeTarField(header, 263, 2, '00');
  writeTarField(header, 265, 32, 'paperandslate');
  writeTarField(header, 297, 32, 'paperandslate');
  writeTarField(header, 329, 8, '0000000\0');
  writeTarField(header, 337, 8, '0000000\0');
  writeTarField(header, 345, 155, prefix);
  const checksum = [...header].reduce((sum, byte) => sum + byte, 0);
  writeTarField(header, 148, 8, `${checksum.toString(8).padStart(6, '0')}\0 `);
  return header;
}

function writeTarField(buffer: Buffer, offset: number, length: number, value: string): void {
  buffer.fill(0, offset, offset + length);
  buffer.write(value.slice(0, length), offset, 'utf8');
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function walk(directory: string): Promise<string[]> {
  const information = await stat(directory);
  if (!information.isDirectory()) return [directory];
  const entries = await readdir(directory, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(path)));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}
