import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Dirent } from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  opendir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, extname, dirname, join, parse, relative, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { format as formatJson } from 'prettier';
import { isJsonObject, parseStrictJson, stringifyCanonical } from '@paperandslate/eom-core';
import { normalizeFsPath } from '@paperandslate/eom-core/fs-path';
import { readSecurityScanEvidence } from './security-scan-evidence.js';
import { safeChildEnvironment } from './safe-child-env.js';
import { MAX_TAR_BYTES, createTarGz, readTarGz, type TarEntry } from './tar.js';
import { pnpmInvocation } from './pnpm-runner.js';

const root = resolve(process.cwd());
export const RELEASE_VERSION = process.env.EOM_RELEASE_VERSION ?? '1.0.0-rc.3';
const outputRoot = resolve(process.env.EOM_RELEASE_OUTPUT ?? join(root, 'release'));
const sourceDateEpoch = Number(process.env.SOURCE_DATE_EPOCH ?? '0');
const RELEASE_MARKER = '.eom-release-generated.json';
const SPECIFICATION = 'https://paperandslate.org/spec/eom/1.0';
const MAX_RELEASE_TREE_ENTRIES = 100_000;
const MAX_RELEASE_TREE_FILES = 100_000;
const MAX_RELEASE_TREE_DEPTH = 128;
const MAX_RELEASE_INPUT_BYTES = MAX_TAR_BYTES;

if (!/^1\.0\.0-rc\.\d+$/u.test(RELEASE_VERSION)) {
  throw new Error(`EOM_RELEASE_VERSION must be a release candidate, received ${RELEASE_VERSION}.`);
}
if (!Number.isInteger(sourceDateEpoch) || sourceDateEpoch < 0) {
  throw new Error('SOURCE_DATE_EPOCH must be a non-negative integer.');
}

export interface ReleasePreparation {
  readonly releaseVersion: string;
  readonly outputRoot: string;
  readonly sourceCommit: string;
  readonly sourceTree: string;
}

export interface ReleaseSourceIdentity {
  readonly sourceCommit?: string;
  readonly sourceTree?: string;
}

export async function prepareReleaseArtifacts(
  targetRoot = outputRoot,
  sourceIdentity: ReleaseSourceIdentity = {},
): Promise<ReleasePreparation> {
  const currentCommit = git('rev-parse', 'HEAD');
  const currentTree = git('rev-parse', `${currentCommit}^{tree}`);
  if ((sourceIdentity.sourceCommit === undefined) !== (sourceIdentity.sourceTree === undefined)) {
    throw new Error('Release provenance must provide both sourceCommit and sourceTree.');
  }
  const sourceCommit = sourceIdentity.sourceCommit ?? currentCommit;
  const sourceTree = sourceIdentity.sourceTree ?? currentTree;
  if (git('rev-parse', `${sourceCommit}^{tree}`) !== sourceTree) {
    throw new Error('Release provenance sourceCommit does not resolve to sourceTree.');
  }
  if (sourceIdentity.sourceCommit !== undefined && !sourceTreeMatchesWorkingSource(sourceTree)) {
    throw new Error(
      `Release provenance source tree is not the checked-out source outside release/ (${currentCommit}, ${currentTree}).`,
    );
  }
  const status = git('status', '--porcelain=v1', '--untracked-files=all');
  const sourceChanges = status
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .filter((path) => path.length > 0 && !isReleasePath(path) && !isGeneratedEvidencePath(path));
  if (sourceChanges.length > 0) {
    throw new Error(
      `Release preparation requires a clean committed source revision outside release/. Commit source changes before generating artifacts: ${sourceChanges.join(', ')}`,
    );
  }
  const securityEvidence = await readSecurityScanEvidence(root);
  if (
    securityEvidence.targetCommit !== sourceCommit ||
    securityEvidence.targetTree !== sourceTree
  ) {
    throw new Error(
      `Release preparation requires sealed formal security evidence for ${sourceCommit} (${sourceTree}).`,
    );
  }

  await assertSafeReleaseOutputRoot(targetRoot);
  assertPinnedPnpmVersion();
  buildWorkspacePackages();
  const generatedAt = new Date(sourceDateEpoch * 1000).toISOString();
  const candidateDirectory = join(targetRoot, `v${RELEASE_VERSION}`);
  await assertReplaceableCandidateDirectory(candidateDirectory, targetRoot);
  await rm(candidateDirectory, { recursive: true, force: true });
  await mkdir(targetRoot, { recursive: true });
  await copyCandidateArtifacts(candidateDirectory, sourceCommit);

  const archiveDefinitions: readonly ArchiveDefinition[] = [
    {
      fileName: `educational-organization-manifest-${RELEASE_VERSION}.tar.gz`,
      entries: await sourceArchiveEntries(),
    },
    {
      fileName: `eom-specification-${RELEASE_VERSION}.tar.gz`,
      entries: await directoryArchiveEntries('spec/1.0', `eom-specification-${RELEASE_VERSION}`),
    },
    {
      fileName: `eom-schemas-${RELEASE_VERSION}.tar.gz`,
      entries: await directoryArchiveEntries('schemas/1.0', `eom-schemas-${RELEASE_VERSION}`),
    },
    {
      fileName: `eom-vocabularies-${RELEASE_VERSION}.tar.gz`,
      entries: await directoryArchiveEntries(
        'vocabularies/1.0',
        `eom-vocabularies-${RELEASE_VERSION}`,
        'vocabularies/registry.json',
      ),
    },
    {
      fileName: `eom-conformance-${RELEASE_VERSION}.tar.gz`,
      entries: await directoryArchiveEntries(
        [
          'fixtures/conformance',
          'fixtures/modules',
          'packages/testkit/src',
          'apps/conformance-runner/src',
        ],
        `eom-conformance-${RELEASE_VERSION}`,
      ),
    },
    {
      fileName: `eom-documentation-${RELEASE_VERSION}.tar.gz`,
      entries: await directoryArchiveEntries(
        ['docs', 'apps/docs/src', 'apps/playground/src'],
        `eom-documentation-${RELEASE_VERSION}`,
      ),
    },
  ];
  const archives: ReleaseArtifact[] = [];
  for (const definition of archiveDefinitions) {
    const bytes = createTarGz(definition.entries);
    await writeFile(join(targetRoot, definition.fileName), bytes);
    archives.push({ path: definition.fileName, bytes });
  }

  const packageManifests = await readWorkspacePackageManifests();
  const packagePacks = await createPackagePackArtifacts(targetRoot, sourceCommit, sourceTree);
  const lockBytes = await readFile(join(root, 'pnpm-lock.yaml'));
  const lockedDependencies = await readLockedDependencies(lockBytes, packageManifests);
  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: 'urn:uuid:00000000-0000-4000-8000-000000000002',
    version: 1,
    metadata: {
      timestamp: generatedAt,
      tools: [{ vendor: 'paper&slate', name: 'eom-release-tooling', version: RELEASE_VERSION }],
      properties: [
        { name: 'eom.release', value: RELEASE_VERSION },
        { name: 'eom.sourceCommit', value: sourceCommit },
        { name: 'eom.sourceTree', value: sourceTree },
        { name: 'eom.sourceDateEpoch', value: String(sourceDateEpoch) },
        { name: 'eom.pnpmLockSha256', value: sha256(lockBytes) },
      ],
    },
    components: [
      ...packageManifests,
      ...(await readLockedExternalComponents(lockBytes, lockedDependencies.scopes)),
    ],
    dependencies: lockedDependencies.dependencies,
  };
  const sbomBytes = Buffer.from(stringifyCanonical(sbom as never), 'utf8');
  const sbomPath = join(targetRoot, 'sbom.cdx.json');
  await writeFile(sbomPath, sbomBytes);

  const sourceArchive = archives[0];
  if (!sourceArchive) throw new Error('The source archive was not generated.');
  const provenance = {
    _type: 'https://in-toto.io/Statement/v1',
    subject: [
      ...archives.map((artifact) => ({
        name: artifact.path,
        digest: { sha256: sha256(artifact.bytes) },
      })),
      { name: 'sbom.cdx.json', digest: { sha256: sha256(sbomBytes) } },
      ...packagePacks.artifacts.map((artifact) => ({
        name: artifact.path,
        digest: { sha256: sha256(artifact.bytes) },
      })),
    ],
    predicateType: 'https://slsa.dev/provenance/v1',
    predicate: {
      buildDefinition: {
        buildType: 'https://paperandslate.org/eom/build/reproducible-source-archive/v2',
        externalParameters: { releaseVersion: RELEASE_VERSION, sourceDateEpoch },
        internalParameters: {
          specification: 'https://paperandslate.org/spec/eom/1.0',
          packageManager: 'pnpm@10.6.0',
        },
        resolvedDependencies: [
          { uri: `git:${sourceCommit}`, digest: { sha1: sourceCommit } },
          { uri: 'file:pnpm-lock.yaml', digest: { sha256: sha256(lockBytes) } },
        ],
      },
      runDetails: {
        builder: { id: 'https://paperandslate.org/eom/local-release-tooling' },
        metadata: { startedOn: generatedAt, finishedOn: generatedAt, reproducible: true },
      },
    },
    sourceCommit,
    sourceTree,
    provenanceStatus: 'local metadata; not a signed external attestation',
  };
  const provenanceBytes = Buffer.from(stringifyCanonical(provenance), 'utf8');
  await writeFile(join(targetRoot, 'build-provenance.json'), provenanceBytes);

  const candidateFiles = await filesWithBytes(candidateDirectory, targetRoot);
  const releaseArtifacts: ReleaseArtifact[] = [
    ...candidateFiles.map((file) => ({
      path: `v${RELEASE_VERSION}/${file.relativePath}`,
      bytes: file.bytes,
    })),
    ...archives,
    ...packagePacks.artifacts,
    { path: 'package-pack-manifest.json', bytes: packagePacks.manifestBytes },
    { path: 'sbom.cdx.json', bytes: sbomBytes },
    { path: 'build-provenance.json', bytes: provenanceBytes },
  ];
  const checksums =
    releaseArtifacts
      .map((artifact) => `${sha256(artifact.bytes)}  ${artifact.path}`)
      .sort()
      .join('\n') + '\n';
  const checksumsBytes = Buffer.from(checksums, 'utf8');
  await writeFile(join(targetRoot, 'checksums.sha256'), checksumsBytes);

  const manifest = {
    release: RELEASE_VERSION,
    channel: 'release-candidate',
    protocolStatus: 'working-draft',
    generatedAt,
    sourceDateEpoch,
    sourceCommit,
    sourceTree,
    specification: 'https://paperandslate.org/spec/eom/1.0',
    schemaBase: 'https://paperandslate.org/schemas/eom/1.0/',
    historicalSuperseded: {
      release: '1.0.0-rc.1',
      path: 'v1.0.0-rc.1',
      status: 'preserved-immutable-superseded',
    },
    historicalSupersededReleases: [
      {
        release: '1.0.0-rc.2',
        path: 'v1.0.0-rc.2',
        status: 'preserved-immutable-superseded',
      },
    ],
    artifacts: releaseArtifacts
      .concat({ path: 'checksums.sha256', bytes: checksumsBytes })
      .map((artifact) => ({
        path: artifact.path,
        bytes: artifact.bytes.length,
        sha256: sha256(artifact.bytes),
      }))
      .sort((left, right) => compareStrings(left.path, right.path)),
    externalGates: {
      ianaRegistration: 'blocked-external',
      independentPublisherConsumerPilot: 'blocked-external',
      legalLicenseReview: 'pending-external',
      productionDeployment: 'not-authorized',
    },
    claimsPolicy:
      'No registration, certification, adoption, legal approval, factual verification, or deployment is claimed by these artifacts.',
  };
  await writeFile(join(targetRoot, 'manifest.json'), stringifyCanonical(manifest), 'utf8');

  return { releaseVersion: RELEASE_VERSION, outputRoot: targetRoot, sourceCommit, sourceTree };
}

interface ArchiveDefinition {
  readonly fileName: string;
  readonly entries: readonly ArchiveEntry[];
}

type ArchiveEntry = TarEntry;

interface ReleaseArtifact {
  readonly path: string;
  readonly bytes: Buffer;
}

interface PackagePackResult {
  readonly manifestBytes: Buffer;
  readonly artifacts: readonly ReleaseArtifact[];
}

interface PackedPackageRecord {
  readonly name: string;
  readonly version: string;
  readonly tarball: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly files: readonly string[];
}

interface Lockfile {
  readonly importers?: Record<string, LockImporter>;
  readonly packages?: Record<string, LockPackage>;
  readonly snapshots?: Record<string, LockSnapshot>;
}

interface LockImporter {
  readonly dependencies?: Record<string, LockReference>;
  readonly optionalDependencies?: Record<string, LockReference>;
  readonly devDependencies?: Record<string, LockReference>;
}

interface LockReference {
  readonly version?: string;
}

interface LockPackage {
  readonly resolution?: { readonly integrity?: unknown };
}

interface LockSnapshot {
  readonly dependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
}

function buildWorkspacePackages(): void {
  runPnpm(['build'], { cwd: root, encoding: 'utf8', stdio: 'inherit' });
}

function assertPinnedPnpmVersion(): void {
  const invocation = pnpmInvocation(['--version']);
  const version = execFileSync(invocation.command, invocation.args, {
    cwd: root,
    encoding: 'utf8',
    env: safeChildEnvironment(),
  }).trim();
  if (version !== '10.6.0') {
    throw new Error(`Release preparation requires pnpm 10.6.0, found ${version || 'unknown'}.`);
  }
}

async function createPackagePackArtifacts(
  targetRoot: string,
  sourceCommit: string,
  sourceTree: string,
): Promise<PackagePackResult> {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'eom-release-pack-'));
  const artifacts: ReleaseArtifact[] = [];
  const packages: PackedPackageRecord[] = [];
  try {
    for (const directory of await workspacePackageDirectories()) {
      const packageJsonValue = parseStrictJson(
        await readFile(join(directory, 'package.json'), 'utf8'),
        `${directory}/package.json`,
      );
      if (!isJsonObject(packageJsonValue))
        throw new Error(`${directory}/package.json must be an object.`);
      const packageJson = packageJsonValue as {
        name?: string;
        version?: string;
        private?: boolean;
        scripts?: Record<string, unknown>;
      };
      if (!packageJson.name || !packageJson.version || packageJson.private === true) continue;
      assertNoLifecycleScripts(packageJson.name, packageJson.scripts);
      const output = runPnpm(
        // pnpm pack has no --ignore-scripts option. Lifecycle scripts are
        // rejected above before packing, so the pack operation cannot execute
        // a release-package hook.
        ['pack', '--pack-destination', temporaryDirectory, '--json'],
        {
          cwd: directory,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      const parsed = parseStrictJson(output.toString(), `${packageJson.name} pnpm pack output`);
      const packed = (Array.isArray(parsed) ? parsed[0] : parsed) as
        | {
            filename?: string;
            files?: readonly { path?: string }[];
          }
        | undefined;
      if (!packed?.filename)
        throw new Error(`${packageJson.name}: pnpm pack returned no filename.`);
      const tarballPath = resolve(packed.filename);
      if (!isWithin(temporaryDirectory, tarballPath)) {
        throw new Error(`${packageJson.name}: pnpm pack returned a tarball outside its temp root.`);
      }
      const packedBytes = await readReleaseInput(tarballPath, temporaryDirectory);
      const tarEntries = readTarGz(packedBytes);
      const actualFiles = tarEntries
        .map((entry) => packageFilePath(entry.path))
        .sort(compareStrings);
      const reportedFiles = packed.files
        ?.map((entry) => entry.path)
        .filter((path): path is string => typeof path === 'string')
        .map(packageFilePath)
        .sort(compareStrings);
      if (reportedFiles && !reportedFilesArePresent(reportedFiles, actualFiles)) {
        throw new Error(`${packageJson.name}: pnpm pack file metadata does not match the tarball.`);
      }
      const normalizedEntries = tarEntries.map((entry) =>
        entry.path === 'package/package.json'
          ? {
              ...entry,
              bytes: Buffer.from(
                stringifyCanonical(
                  parseStrictJson(entry.bytes.toString('utf8'), `${packageJson.name} package.json`),
                ),
                'utf8',
              ),
            }
          : entry,
      );
      const bytes = createTarGz(normalizedEntries);
      const files = actualFiles;
      if (files.some((file) => file.startsWith('src/'))) {
        throw new Error(`${packageJson.name}: source files cannot enter a release package.`);
      }
      if (!files.includes('dist/index.js') || !files.includes('dist/index.d.ts')) {
        throw new Error(`${packageJson.name}: compiled package entrypoints are missing.`);
      }
      const fileName = basename(tarballPath);
      const artifactPath = `packages/${fileName}`;
      const artifactBytes = Buffer.from(bytes);
      await mkdir(join(targetRoot, 'packages'), { recursive: true });
      await writeFile(join(targetRoot, artifactPath), artifactBytes);
      artifacts.push({ path: artifactPath, bytes: artifactBytes });
      packages.push({
        name: packageJson.name,
        version: packageJson.version,
        tarball: artifactPath,
        bytes: artifactBytes.length,
        sha256: sha256(artifactBytes),
        files,
      });
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  packages.sort((left, right) => compareStrings(left.name, right.name));
  const manifest = {
    version: 1,
    release: RELEASE_VERSION,
    sourceCommit,
    sourceTree,
    packageManager: 'pnpm@10.6.0',
    packages,
  };
  const manifestBytes = Buffer.from(
    await formatJson(stringifyCanonical(manifest as never), {
      parser: 'json',
      printWidth: 100,
      tabWidth: 2,
      useTabs: false,
      trailingComma: 'none',
      endOfLine: 'lf',
    }),
    'utf8',
  );
  await writeFile(join(targetRoot, 'package-pack-manifest.json'), manifestBytes);
  return {
    manifestBytes,
    artifacts,
  };
}

function packageFilePath(path: string): string {
  return path.startsWith('package/') ? path.slice('package/'.length) : path;
}

function reportedFilesArePresent(reported: readonly string[], actual: readonly string[]): boolean {
  const actualSet = new Set(actual);
  return (
    new Set(reported).size === reported.length && reported.every((path) => actualSet.has(path))
  );
}

async function workspacePackageDirectories(): Promise<string[]> {
  const paths = [...(await walk(join(root, 'packages'))), ...(await walk(join(root, 'apps')))]
    .filter((path) => path.endsWith('package.json'))
    .map((path) => dirname(path));
  return [...new Set(paths)].sort(compareStrings);
}

interface ReleaseFile {
  readonly relativePath: string;
  readonly bytes: Buffer;
}

async function copyCandidateArtifacts(
  candidateDirectory: string,
  sourceCommit: string,
): Promise<void> {
  const sources: readonly [string, string][] = [
    ['spec/1.0', 'spec/1.0'],
    ['schemas/1.0', 'schemas/1.0'],
    ['mappings/registry.json', 'mappings/registry.json'],
    ['vocabularies/registry.json', 'vocabularies/registry.json'],
    ['vocabularies/1.0', 'vocabularies/1.0'],
    ['fixtures/conformance', 'fixtures/conformance'],
    ['fixtures/modules', 'fixtures/modules'],
    ['requirements', 'requirements'],
    ['reports', 'reports'],
    ['docs/migration-policy.md', 'docs/migration-policy.md'],
  ];
  for (const [source, target] of sources) {
    const sourcePath = join(root, source);
    if (!(await exists(sourcePath))) continue;
    const targetPath = join(candidateDirectory, target);
    await copyReleaseTree(
      sourcePath,
      targetPath,
      source === 'reports'
        ? (relativePath) => relativePath !== 'local' && !relativePath.startsWith('local/')
        : undefined,
    );
  }
  await writeFile(
    join(candidateDirectory, 'STATUS.md'),
    [
      `# EOM ${RELEASE_VERSION}`,
      '',
      'This is a reproducible release-candidate artifact for the EOM 1.0 working draft.',
      'The proposed well-known URI suffix is not claimed as IANA-registered.',
      'Independent pilots, legal review, external certification, and production deployment remain external gates.',
      '',
      `Source commit: ${sourceCommit}`,
      `Source date epoch: ${sourceDateEpoch} (${new Date(sourceDateEpoch * 1000).toISOString()})`,
      '',
    ].join('\n'),
    'utf8',
  );
  await writeFile(
    join(candidateDirectory, RELEASE_MARKER),
    stringifyCanonical({
      version: 1,
      generator: 'eom-release',
      specification: SPECIFICATION,
      purpose: 'release-candidate',
      release: RELEASE_VERSION,
      sourceCommit,
    }),
    'utf8',
  );
}

async function copyReleaseTree(
  sourcePath: string,
  targetPath: string,
  include?: (relativePath: string) => boolean,
): Promise<void> {
  for (const file of await walk(sourcePath)) {
    const relativePath = relative(sourcePath, file).replaceAll('\\', '/');
    if (include && !include(relativePath)) continue;
    const destination = relativePath ? join(targetPath, relativePath) : targetPath;
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, await readReleaseInput(file));
  }
}

async function sourceArchiveEntries(): Promise<ArchiveEntry[]> {
  const roots = [
    '.changeset',
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
    'reports',
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
    .sort((left, right) => compareStrings(relative(root, left), relative(root, right)));
  const entries: ArchiveEntry[] = [];
  let totalBytes = 0;
  for (const path of paths) {
    const relativePath = relative(root, path).replaceAll('\\', '/');
    const bytes = await readReleaseInput(path);
    totalBytes += bytes.length;
    if (totalBytes > MAX_TAR_BYTES)
      throw new Error(`Release source archive exceeds the ${MAX_TAR_BYTES}-byte safety limit.`);
    entries.push({
      path: `educational-organization-manifest-${RELEASE_VERSION}/${relativePath}`,
      bytes,
    });
  }
  return entries;
}

async function directoryArchiveEntries(
  directories: string | readonly string[],
  prefix: string,
  additionalFiles?: string,
): Promise<ArchiveEntry[]> {
  const roots = typeof directories === 'string' ? [directories] : directories;
  const paths = [
    ...(await Promise.all(roots.map((directory) => walk(join(root, directory))))).flat(),
    ...(additionalFiles ? [join(root, additionalFiles)] : []),
  ]
    .filter((path) => isArchivePath(relative(root, path)))
    .sort((left, right) => compareStrings(relative(root, left), relative(root, right)));
  const entries: ArchiveEntry[] = [];
  let totalBytes = 0;
  for (const path of paths) {
    const relativePath = relative(root, path).replaceAll('\\', '/');
    const bytes = await readReleaseInput(path);
    totalBytes += bytes.length;
    if (totalBytes > MAX_TAR_BYTES)
      throw new Error(`Release archive exceeds the ${MAX_TAR_BYTES}-byte safety limit.`);
    entries.push({ path: `${prefix}/${relativePath}`, bytes });
  }
  return entries;
}

function isArchivePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  const parts = normalized.split('/');
  if (parts.some((part) => ['.git', 'dist', 'node_modules', 'generated', 'build'].includes(part)))
    return false;
  if (normalized.startsWith('docs/goals/')) return false;
  if (normalized.startsWith('reports/local/')) return false;
  if (normalized.startsWith('release/')) return false;
  return extname(normalized) !== '.log';
}

async function filesWithBytes(directory: string, allowedRoot = root): Promise<ReleaseFile[]> {
  const paths = await walk(directory);
  const files: ReleaseFile[] = [];
  for (const path of paths) {
    files.push({
      relativePath: relative(directory, path).replaceAll('\\', '/'),
      bytes: await readReleaseInput(path, allowedRoot),
    });
  }
  return files.sort((left, right) => compareStrings(left.relativePath, right.relativePath));
}

async function readWorkspacePackageManifests(): Promise<readonly Record<string, unknown>[]> {
  const paths = [
    join(root, 'package.json'),
    ...(await walk(join(root, 'packages'))),
    ...(await walk(join(root, 'apps'))),
  ]
    .filter((path) => path.endsWith('package.json'))
    .sort();
  const components: Record<string, unknown>[] = [];
  for (const path of paths) {
    const value = JSON.parse(await readFile(path, 'utf8')) as {
      name?: string;
      version?: string;
      license?: string;
    };
    if (!value.name || !value.version) continue;
    const component: Record<string, unknown> = {
      type: 'library',
      name: value.name.startsWith('@') ? value.name.split('/')[1] : value.name,
      version: value.version,
      scope: 'required',
      'bom-ref': `pkg:npm/${value.name}@${value.version}`,
      purl: `pkg:npm/${value.name}@${value.version}`,
    };
    if (value.name.startsWith('@')) component.group = value.name.split('/')[0]?.slice(1);
    if (value.license) component.licenses = [{ license: { id: value.license } }];
    components.push(component);
  }
  return components.sort((left, right) => compareStrings(String(left.purl), String(right.purl)));
}

async function readLockedExternalComponents(
  lockBytes: Buffer,
  scopes: ReadonlyMap<string, 'required' | 'optional' | 'excluded'> = new Map(),
): Promise<readonly Record<string, unknown>[]> {
  const lock = parseYaml(lockBytes.toString('utf8')) as {
    packages?: Record<string, unknown>;
  };
  const workspaceNames = new Set<string>();
  for (const path of [
    join(root, 'package.json'),
    ...(await walk(join(root, 'packages'))),
    ...(await walk(join(root, 'apps'))),
  ].filter((path) => path.endsWith('package.json'))) {
    const parsed = parseStrictJson(await readFile(path, 'utf8'), path);
    const value = isJsonObject(parsed) ? (parsed as { name?: string }) : {};
    if (value.name) workspaceNames.add(value.name);
  }
  const components = new Map<string, Record<string, unknown>>();
  for (const key of Object.keys(lock.packages ?? {}).sort()) {
    const parsed = parseLockPackageKey(key);
    if (!parsed || workspaceNames.has(parsed.name)) continue;
    const packageRecord = isJsonObject(lock.packages?.[key]) ? lock.packages[key] : {};
    const purl = `pkg:npm/${parsed.name}@${parsed.version}`;
    const component: Record<string, unknown> = {
      type: 'library',
      name: parsed.name.startsWith('@') ? parsed.name.split('/')[1] : parsed.name,
      version: parsed.version,
      scope: scopes.get(purl) ?? 'excluded',
      'bom-ref': purl,
      purl,
    };
    if (parsed.name.startsWith('@')) component.group = parsed.name.split('/')[0]?.slice(1);
    const resolution = isJsonObject(packageRecord.resolution) ? packageRecord.resolution : {};
    const integrity = typeof resolution.integrity === 'string' ? resolution.integrity : undefined;
    const hash = integrityHash(integrity);
    if (hash) component.hashes = [hash];
    components.set(purl, component);
  }
  return [...components.values()].sort((left, right) =>
    compareStrings(String(left.purl), String(right.purl)),
  );
}

async function readLockedDependencies(
  lockBytes: Buffer,
  workspaceComponents: readonly Record<string, unknown>[],
): Promise<{
  readonly dependencies: readonly Record<string, unknown>[];
  readonly scopes: ReadonlyMap<string, 'required' | 'optional' | 'excluded'>;
}> {
  const lock = parseYaml(lockBytes.toString('utf8')) as Lockfile;
  const workspaceNames = new Set<string>();
  for (const component of workspaceComponents) {
    const purl = typeof component.purl === 'string' ? component.purl : undefined;
    const name = purl ? purlName(purl) : undefined;
    if (name) workspaceNames.add(name);
  }
  const packagePurls = new Map<string, string>();
  for (const key of Object.keys(lock.packages ?? {}).sort(compareStrings)) {
    const parsed = parseLockPackageKey(key);
    if (!parsed || workspaceNames.has(parsed.name)) continue;
    packagePurls.set(key, `pkg:npm/${parsed.name}@${parsed.version}`);
  }
  const workspacePurls = new Map<string, string>();
  for (const component of workspaceComponents) {
    const purl = typeof component.purl === 'string' ? component.purl : undefined;
    const name = purl ? purlName(purl) : undefined;
    if (name && purl) workspacePurls.set(name, purl);
  }
  const workspaceImporterPurls = await readWorkspaceImporterPurls(workspaceComponents);

  const scopes = new Map<string, 'required' | 'optional' | 'excluded'>();
  const requiredRoots: string[] = [];
  const optionalRoots: string[] = [];
  const developmentRoots: string[] = [];
  const dependencyEdges = new Map<string, Set<string>>();
  for (const [importerPath, importer] of Object.entries(lock.importers ?? {})) {
    const importerPurl = workspaceImporterPurls.get(importerPath);
    addImporterReferences(
      importer?.dependencies,
      'required',
      requiredRoots,
      dependencyEdges,
      workspacePurls,
      packagePurls,
      scopes,
      importerPurl,
    );
    addImporterReferences(
      importer?.optionalDependencies,
      'optional',
      optionalRoots,
      dependencyEdges,
      workspacePurls,
      packagePurls,
      scopes,
      importerPurl,
    );
    addImporterReferences(
      importer?.devDependencies,
      'excluded',
      developmentRoots,
      dependencyEdges,
      workspacePurls,
      packagePurls,
      scopes,
      importerPurl,
    );
  }

  for (const [key, purl] of packagePurls) {
    const snapshot = lock.snapshots?.[key];
    if (!snapshot) continue;
    const edges = dependencyEdges.get(purl) ?? new Set<string>();
    for (const [name, reference] of Object.entries({
      ...snapshot.dependencies,
      ...snapshot.optionalDependencies,
    })) {
      const dependency = resolveLockReference(name, reference, workspacePurls, packagePurls);
      if (dependency) edges.add(dependency);
    }
    dependencyEdges.set(purl, edges);
  }

  const required = reachable(requiredRoots, dependencyEdges);
  const optional = reachable(optionalRoots, dependencyEdges);
  const development = reachable(developmentRoots, dependencyEdges);
  for (const purl of new Set([...packagePurls.values(), ...workspacePurls.values()])) {
    if (required.has(purl)) scopes.set(purl, 'required');
    else if (optional.has(purl)) scopes.set(purl, 'optional');
    else if (development.has(purl)) scopes.set(purl, 'excluded');
  }

  const components = new Set([...packagePurls.values(), ...workspacePurls.values()]);
  return {
    dependencies: [...components].sort(compareStrings).map((ref) => ({
      ref,
      dependsOn: [...(dependencyEdges.get(ref) ?? [])].sort(compareStrings),
    })),
    scopes,
  };
}

async function readWorkspaceImporterPurls(
  workspaceComponents: readonly Record<string, unknown>[],
): Promise<Map<string, string>> {
  const purlsByName = new Map<string, string>();
  for (const component of workspaceComponents) {
    const purl = typeof component.purl === 'string' ? component.purl : undefined;
    const name = purl ? purlName(purl) : undefined;
    if (name && purl) purlsByName.set(name, purl);
  }
  const paths = [
    join(root, 'package.json'),
    ...(await walk(join(root, 'packages'))),
    ...(await walk(join(root, 'apps'))),
  ].filter((path) => path.endsWith('package.json'));
  const result = new Map<string, string>();
  for (const path of paths) {
    const value = parseStrictJson(await readFile(path, 'utf8'), path);
    const name = isJsonObject(value) && typeof value.name === 'string' ? value.name : undefined;
    const purl = name ? purlsByName.get(name) : undefined;
    if (purl) {
      const importerPath = relative(root, dirname(path)).replaceAll('\\', '/') || '.';
      result.set(importerPath, purl);
    }
  }
  return result;
}

function addImporterReferences(
  references: Record<string, LockReference> | undefined,
  scope: 'required' | 'optional' | 'excluded',
  roots: string[],
  edges: Map<string, Set<string>>,
  workspacePurls: Map<string, string>,
  packagePurls: Map<string, string>,
  scopes: Map<string, 'required' | 'optional' | 'excluded'>,
  importerPurl: string | undefined,
): void {
  for (const [name, reference] of Object.entries(references ?? {})) {
    const purl = resolveLockReference(name, reference, workspacePurls, packagePurls);
    if (!purl) continue;
    roots.push(purl);
    const previous = scopes.get(purl);
    if (previous !== 'required' && (previous === undefined || scope === 'required')) {
      scopes.set(purl, scope);
    }
    if (!edges.has(purl)) edges.set(purl, new Set());
    if (importerPurl) {
      const importerEdges = edges.get(importerPurl) ?? new Set<string>();
      importerEdges.add(purl);
      edges.set(importerPurl, importerEdges);
    }
  }
}

function resolveLockReference(
  name: string,
  reference: LockReference | string | undefined,
  workspacePurls: Map<string, string>,
  packagePurls: Map<string, string>,
): string | undefined {
  const version = typeof reference === 'string' ? reference : reference?.version;
  if (!version) return undefined;
  if (version.startsWith('link:')) return workspacePurls.get(name);
  const normalizedVersion = version.split('(', 1)[0];
  const exactKey = `${name}@${normalizedVersion}`;
  const matchingKey = packagePurls.has(exactKey)
    ? exactKey
    : [...packagePurls.keys()].find((key) => {
        const parsed = parseLockPackageKey(key);
        return parsed?.name === name && parsed.version === normalizedVersion;
      });
  return matchingKey ? packagePurls.get(matchingKey) : undefined;
}

function reachable(roots: readonly string[], edges: Map<string, Set<string>>): Set<string> {
  const seen = new Set<string>();
  const pending = [...roots];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    pending.push(...(edges.get(current) ?? []));
  }
  return seen;
}

function purlName(purl: string): string | undefined {
  const value = purl.startsWith('pkg:npm/') ? purl.slice('pkg:npm/'.length) : '';
  const separator = value.lastIndexOf('@');
  return separator > 0 ? value.slice(0, separator) : undefined;
}

function integrityHash(integrity: string | undefined): Record<string, string> | undefined {
  if (!integrity) return undefined;
  const candidates = integrity
    .split(/\s+/u)
    .map((value) => /^([a-z0-9]+)-([A-Za-z0-9+/]+={0,2})$/u.exec(value))
    .filter((match): match is RegExpExecArray => match !== null)
    .sort((left, right) => hashStrength(right[1]!) - hashStrength(left[1]!));
  const selected = candidates[0];
  if (!selected) return undefined;
  const algorithm = selected[1]!.toUpperCase().replace(/^SHA(?=\d)/u, 'SHA-');
  if (!['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'].includes(algorithm)) return undefined;
  try {
    return { algorithm, value: Buffer.from(selected[2]!, 'base64').toString('hex') };
  } catch {
    return undefined;
  }
}

function hashStrength(algorithm: string): number {
  return { sha512: 4, sha384: 3, sha256: 2, sha1: 1 }[algorithm.toLowerCase()] ?? 0;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseLockPackageKey(key: string): { name: string; version: string } | undefined {
  const separator = key.startsWith('@') ? key.indexOf('@', 1) : key.indexOf('@');
  if (separator <= 0) return undefined;
  const name = key.slice(0, separator);
  const version = key.slice(separator + 1).split('(', 1)[0];
  if (!name || !version || !/^\d+\.\d+\.\d+/u.test(version)) return undefined;
  return { name, version };
}

function assertNoLifecycleScripts(
  name: string,
  scripts: Record<string, unknown> | undefined,
): void {
  const lifecycleScripts = [
    'prepublish',
    'prepare',
    'prepublishOnly',
    'publish',
    'postpublish',
    'prepack',
    'postpack',
  ];
  const configured = lifecycleScripts.filter((script) => Object.hasOwn(scripts ?? {}, script));
  if (configured.length > 0) {
    throw new Error(
      `${name}: lifecycle scripts are not permitted in release packages: ${configured.join(', ')}`,
    );
  }
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function git(...args: string[]): string {
  // Preserve porcelain status columns: trimming the whole output turns the
  // first " M path" row into "M path" and drops its first path character.
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).replace(/(?:\r?\n)+$/u, '');
}

function runPnpm(
  args: readonly string[],
  options: Parameters<typeof execFileSync>[2],
): Buffer | string {
  const invocation = pnpmInvocation(args);
  const safeOptions =
    options && typeof options === 'object'
      ? { ...options, env: safeChildEnvironment() }
      : { env: safeChildEnvironment() };
  return execFileSync(invocation.command, invocation.args, safeOptions);
}

function sourceTreeMatchesWorkingSource(sourceTree: string): boolean {
  try {
    execFileSync(
      'git',
      [
        'diff',
        '--quiet',
        sourceTree,
        '--',
        '.',
        ':(exclude)release/**',
        ...generatedEvidencePathspecs(),
      ],
      { cwd: root, stdio: 'ignore' },
    );
    return true;
  } catch {
    return false;
  }
}

function isReleasePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/').replace(/^"|"$/gu, '');
  return normalized === 'release' || normalized.startsWith('release/');
}

function isGeneratedEvidencePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/').replace(/^"|"$/gu, '');
  return generatedEvidencePaths().some(
    (candidate) => normalized === candidate || normalized.startsWith(`${candidate}/`),
  );
}

function generatedEvidencePaths(): readonly string[] {
  return [
    'reports/remediation-audit.md',
    'reports/release-checklist.md',
    'reports/security-scan.md',
    'reports/security-scan.json',
    'reports/security-scan',
    'reports/verification/local-gates.json',
    'reports/verification/traceability-result.json',
    'requirements/TRACEABILITY_MATRIX.md',
    'requirements/plan-file-traceability.json',
  ];
}

function generatedEvidencePathspecs(): readonly string[] {
  return generatedEvidencePaths().map((path) =>
    path === 'reports/security-scan' ? ':(exclude)reports/security-scan/**' : `:(exclude)${path}`,
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

async function assertSafeReleaseOutputRoot(targetRoot: string): Promise<void> {
  const resolvedTarget = resolve(targetRoot);
  const resolvedProjectRoot = resolve(root);
  const projectRoot = await existingRealPath(root);
  const resolvedReleaseDirectory = resolve(join(root, 'release'));
  const releaseDirectory = await existingRealPath(resolvedReleaseDirectory);
  const temporaryDirectory = await existingRealPath(tmpdir());
  const target = await existingRealPath(resolvedTarget);
  const home = await existingRealPath(homedir());
  const currentDirectory = await existingRealPath(process.cwd());

  if (
    normalizeFsPath(projectRoot) !== normalizeFsPath(resolvedProjectRoot) ||
    normalizeFsPath(releaseDirectory) !== normalizeFsPath(resolvedReleaseDirectory)
  ) {
    throw new Error(
      'Release preparation requires a real project and release directory, not a symlink or junction.',
    );
  }
  if (normalizeFsPath(target) !== normalizeFsPath(resolvedTarget)) {
    throw new Error(`Release output must not traverse a symlink or junction: ${resolvedTarget}`);
  }

  if (
    parse(target).root === target ||
    normalizeFsPath(target) === normalizeFsPath(home) ||
    normalizeFsPath(target) === normalizeFsPath(currentDirectory) ||
    normalizeFsPath(target) === normalizeFsPath(projectRoot) ||
    normalizeFsPath(target) === normalizeFsPath(temporaryDirectory)
  ) {
    throw new Error(`Refusing to use a protected release output root: ${resolvedTarget}`);
  }

  const isCanonicalReleaseRoot = target === releaseDirectory;
  const isIsolatedTemporaryRoot = isWithin(temporaryDirectory, target);
  const isOutsideProject = !isWithin(projectRoot, target);
  if (!isCanonicalReleaseRoot && !isIsolatedTemporaryRoot && !isOutsideProject) {
    throw new Error(
      `Release output must use the canonical release/ directory, an isolated temporary directory, or an explicitly marked external root: ${resolvedTarget}`,
    );
  }
  if (!isOutsideProject || isIsolatedTemporaryRoot) return;

  const configuredOutput = process.env.EOM_RELEASE_OUTPUT;
  if (
    !configuredOutput ||
    normalizeFsPath(resolve(configuredOutput)) !== normalizeFsPath(resolvedTarget)
  ) {
    throw new Error(
      'External release output requires EOM_RELEASE_OUTPUT to explicitly name the target directory.',
    );
  }
  const markerPath = join(target, RELEASE_MARKER);
  let marker: unknown;
  try {
    marker = parseStrictJson(await readFile(markerPath, 'utf8'), markerPath);
  } catch {
    throw new Error(
      `External release output must contain a strict JSON ${RELEASE_MARKER} ownership marker.`,
    );
  }
  if (
    !isJsonObject(marker) ||
    marker.generator !== 'eom-release' ||
    marker.specification !== SPECIFICATION ||
    marker.purpose !== 'release-artifacts'
  ) {
    throw new Error(`The external release output marker ${markerPath} is not valid.`);
  }
}

async function assertReplaceableCandidateDirectory(
  candidateDirectory: string,
  outputRoot: string,
): Promise<void> {
  let information;
  try {
    information = await lstat(candidateDirectory);
  } catch (error) {
    if (isNotFound(error)) return;
    throw error;
  }
  if (information.isSymbolicLink() || !information.isDirectory()) {
    throw new Error(`Refusing to replace a non-directory release candidate: ${candidateDirectory}`);
  }
  const candidateReal = await realpath(candidateDirectory);
  const outputReal = await existingRealPath(outputRoot);
  if (!isWithin(outputReal, candidateReal)) {
    throw new Error(`Release candidate escapes its output root: ${candidateDirectory}`);
  }
  const markerPath = join(candidateDirectory, RELEASE_MARKER);
  if (await exists(markerPath)) {
    let marker: unknown;
    try {
      marker = parseStrictJson(
        (await readReleaseInput(markerPath, outputRoot)).toString('utf8'),
        markerPath,
      );
    } catch {
      throw new Error(`The release candidate ownership marker ${markerPath} is invalid.`);
    }
    if (
      !isJsonObject(marker) ||
      marker.generator !== 'eom-release' ||
      marker.specification !== SPECIFICATION ||
      marker.purpose !== 'release-candidate' ||
      marker.release !== RELEASE_VERSION
    ) {
      throw new Error(`The release candidate ownership marker ${markerPath} is not compatible.`);
    }
  } else {
    const statusPath = join(candidateDirectory, 'STATUS.md');
    const status = (await readReleaseInput(statusPath, outputRoot)).toString('utf8');
    if (!status.startsWith(`# EOM ${RELEASE_VERSION}\n`)) {
      throw new Error(`Refusing to replace an unmarked release candidate: ${candidateDirectory}`);
    }
  }
  await walk(candidateDirectory);
}

async function existingRealPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if (!isNotFound(error)) throw error;
    const parent = dirname(path);
    if (parent === path) return resolve(path);
    return join(await existingRealPath(parent), basename(path));
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}

function isWithin(parent: string, child: string): boolean {
  const suffix = relative(resolve(parent), resolve(child));
  return suffix === '' || (!suffix.startsWith('..') && !parse(suffix).root);
}

async function walk(
  directory: string,
  state: { entries: number; files: number } = { entries: 0, files: 0 },
  depth = 0,
): Promise<string[]> {
  if (depth > MAX_RELEASE_TREE_DEPTH)
    throw new Error(`Release input directory depth exceeds ${MAX_RELEASE_TREE_DEPTH}.`);
  let information;
  try {
    information = await lstat(directory);
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
  if (information.isSymbolicLink()) {
    throw new Error(`Release input must not contain a symlink or junction: ${directory}`);
  }
  if (!information.isDirectory()) return [directory];
  const handle = await opendir(directory);
  const entries: Dirent[] = [];
  try {
    for await (const entry of handle) {
      state.entries += 1;
      if (state.entries > MAX_RELEASE_TREE_ENTRIES)
        throw new Error(
          `Release input traversal exceeds ${MAX_RELEASE_TREE_ENTRIES} directory entries.`,
        );
      entries.push(entry);
    }
  } finally {
    await handle.close().catch(() => undefined);
  }
  entries.sort((left, right) => compareStrings(left.name, right.name));
  const result: string[] = [];
  for (const entry of entries) {
    // Workspace package managers create dependency trees beneath each app and
    // package. Those trees are intentionally excluded from every release
    // archive; do not descend into them just to reject their expected
    // symlinked workspace entries. Symlinks in paths that can be archived are
    // still rejected below before any bytes are read.
    if (isExcludedArchiveDirectory(entry.name)) continue;
    const path = join(directory, entry.name);
    const child = await lstat(path);
    if (child.isSymbolicLink()) {
      throw new Error(`Release input must not contain a symlink or junction: ${path}`);
    }
    if (child.isDirectory()) result.push(...(await walk(path, state, depth + 1)));
    else if (child.isFile()) {
      state.files += 1;
      if (state.files > MAX_RELEASE_TREE_FILES)
        throw new Error(`Release input contains more than ${MAX_RELEASE_TREE_FILES} files.`);
      result.push(path);
    } else throw new Error(`Release input contains a non-regular file: ${path}`);
  }
  return result;
}

function isExcludedArchiveDirectory(name: string): boolean {
  return ['.git', 'dist', 'node_modules', 'generated', 'build'].includes(name);
}

async function readReleaseInput(path: string, allowedRoot = root): Promise<Buffer> {
  const information = await lstat(path);
  if (information.isSymbolicLink() || !information.isFile()) {
    throw new Error(`Release input must be a regular file without symlink traversal: ${path}`);
  }
  const trustedRoot = await existingRealPath(allowedRoot);
  const fileReal = await realpath(path);
  if (!isWithin(trustedRoot, fileReal)) {
    throw new Error(`Release input escapes its trusted root: ${path}`);
  }
  if (information.size > MAX_RELEASE_INPUT_BYTES) {
    throw new Error(
      `Release input exceeds the ${MAX_RELEASE_INPUT_BYTES}-byte safety limit: ${path}`,
    );
  }
  return readFile(path);
}

const invokedFile = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedFile === resolve(fileURLToPath(import.meta.url))) {
  const result = await prepareReleaseArtifacts();
  console.log(
    `prepared ${result.releaseVersion} from ${result.sourceCommit}: release artifacts written to ${result.outputRoot}`,
  );
}
