import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isJsonObject, parseStrictJson } from '@paperandslate/eom-core';

const root = resolve(process.cwd());
const releaseRoot = join(root, 'release');
const expectedRelease = '1.0.0-rc.3';
const manifest = parseStrictJson(await readFile(join(releaseRoot, 'manifest.json'), 'utf8'));
const failures: string[] = [];

if (!isRecord(manifest) || !Array.isArray(manifest.artifacts)) {
  failures.push('release/manifest.json must contain an artifacts array.');
} else {
  if (manifest.release !== expectedRelease)
    failures.push(`release manifest must describe ${expectedRelease}.`);
  if (manifest.channel !== 'release-candidate')
    failures.push('release manifest must retain release-candidate channel.');
  if (manifest.protocolStatus !== 'working-draft')
    failures.push('release manifest must retain working-draft status.');
  if (!isCommit(manifest.sourceCommit))
    failures.push('release manifest must bind to a source commit.');
  else if (!gitCommitExists(manifest.sourceCommit))
    failures.push(`release source commit is not present in the checkout: ${manifest.sourceCommit}`);
  if (!isCommit(manifest.sourceTree))
    failures.push('release manifest must record the source tree.');
  else if (
    isCommit(manifest.sourceCommit) &&
    gitCommitTree(manifest.sourceCommit) !== manifest.sourceTree
  ) {
    failures.push('release manifest sourceCommit and sourceTree do not identify the same tree.');
  }
  if (isCommit(manifest.sourceTree) && !sourceTreeMatchesCheckedOutSource(manifest.sourceTree)) {
    failures.push(
      'release manifest is stale: checked-out source outside release/ differs from the recorded source tree.',
    );
  }
  if (!isRecord(manifest.externalGates)) {
    failures.push('release manifest must record external gates.');
  } else {
    if (manifest.externalGates.ianaRegistration !== 'blocked-external')
      failures.push('release manifest must mark IANA registration as blocked-external');
    if (manifest.externalGates.independentPublisherConsumerPilot !== 'blocked-external')
      failures.push('release manifest must mark independent interoperability as blocked-external');
    if (manifest.externalGates.productionDeployment !== 'not-authorized')
      failures.push('release manifest must keep production deployment not-authorized');
  }
  const historical: unknown[] = [
    ...(isRecord(manifest.historicalSuperseded) ? [manifest.historicalSuperseded] : []),
    ...(Array.isArray(manifest.historicalSupersededReleases)
      ? manifest.historicalSupersededReleases.filter(isRecord)
      : []),
  ];
  const historicalRecords = historical.filter(isRecord);
  for (const release of ['1.0.0-rc.1', '1.0.0-rc.2']) {
    if (
      !historicalRecords.some(
        (entry) => entry.release === release && entry.status === 'preserved-immutable-superseded',
      )
    ) {
      failures.push(`release manifest must identify preserved ${release} evidence as superseded.`);
    }
  }

  const artifactPaths = new Set<string>();
  for (const artifact of manifest.artifacts) {
    if (
      !isRecord(artifact) ||
      typeof artifact.path !== 'string' ||
      typeof artifact.sha256 !== 'string' ||
      typeof artifact.bytes !== 'number'
    ) {
      failures.push('release/manifest.json contains a malformed artifact entry');
      continue;
    }
    if (artifactPaths.has(artifact.path))
      failures.push(`duplicate release artifact: ${artifact.path}`);
    artifactPaths.add(artifact.path);
    if (artifact.path.startsWith(`v${expectedRelease}/reports/local/`)) {
      failures.push('release candidate must not include ignored local conformance reports.');
    }
    const path = join(releaseRoot, artifact.path);
    if (!isWithin(releaseRoot, path)) {
      failures.push(`artifact escapes release root: ${artifact.path}`);
      continue;
    }
    try {
      const bytes = await readFile(path);
      if (bytes.length !== artifact.bytes) failures.push(`${artifact.path}: byte length changed`);
      if (sha256(bytes) !== artifact.sha256) failures.push(`${artifact.path}: SHA-256 changed`);
    } catch {
      failures.push(`${artifact.path}: artifact is missing`);
    }
  }

  const requiredArtifacts = [
    `educational-organization-manifest-${expectedRelease}.tar.gz`,
    `eom-specification-${expectedRelease}.tar.gz`,
    `eom-schemas-${expectedRelease}.tar.gz`,
    `eom-vocabularies-${expectedRelease}.tar.gz`,
    `eom-conformance-${expectedRelease}.tar.gz`,
    `eom-documentation-${expectedRelease}.tar.gz`,
    'sbom.cdx.json',
    'build-provenance.json',
    'package-pack-manifest.json',
    `v${expectedRelease}/STATUS.md`,
  ];
  for (const path of requiredArtifacts) {
    if (!artifactPaths.has(path))
      failures.push(`release manifest is missing required artifact ${path}`);
  }
}

const historicalRoot = join(releaseRoot, 'v1.0.0-rc.1');
try {
  await access(join(historicalRoot, 'STATUS.md'));
  const historicalStatus = await readFile(join(historicalRoot, 'STATUS.md'), 'utf8');
  if (!historicalStatus.includes('# EOM 1.0.0-rc.1'))
    failures.push('historical RC1 artifact does not contain its original status marker');
} catch {
  failures.push('historical RC1 candidate must remain present and immutable.');
}

const historicalRc2Root = join(releaseRoot, 'v1.0.0-rc.2');
try {
  await access(join(historicalRc2Root, 'STATUS.md'));
  const historicalStatus = await readFile(join(historicalRc2Root, 'STATUS.md'), 'utf8');
  if (!historicalStatus.includes('# EOM 1.0.0-rc.2'))
    failures.push('historical RC2 artifact does not contain its original status marker');
} catch {
  failures.push('historical RC2 candidate must remain present and immutable.');
}

const checksums = await readText('checksums.sha256');
const checksumPaths = new Set<string>();
for (const line of checksums.trim().split(/\r?\n/u)) {
  const match = /^(?<hash>[a-f0-9]{64})[ ]{2}(?<path>.+)$/u.exec(line);
  if (!match?.groups) {
    failures.push(`checksums.sha256: malformed line ${line}`);
    continue;
  }
  const checksumPath = match.groups.path;
  const checksumHash = match.groups.hash;
  if (typeof checksumPath !== 'string' || typeof checksumHash !== 'string') {
    failures.push(`checksums.sha256: malformed line ${line}`);
    continue;
  }
  if (checksumPaths.has(checksumPath))
    failures.push(`checksums.sha256: duplicate entry ${checksumPath}`);
  checksumPaths.add(checksumPath);
  const absoluteChecksumPath = join(releaseRoot, checksumPath);
  if (!isWithin(releaseRoot, absoluteChecksumPath)) {
    failures.push(`checksums.sha256: path escapes release root ${checksumPath}`);
    continue;
  }
  try {
    const checksumBytes = await readFile(absoluteChecksumPath);
    if (sha256(checksumBytes) !== checksumHash)
      failures.push(`checksums.sha256: digest mismatch for ${checksumPath}`);
  } catch {
    failures.push(`checksums.sha256: missing artifact ${checksumPath}`);
  }
}
if (isRecord(manifest) && Array.isArray(manifest.artifacts)) {
  const expectedChecksumPaths = new Set(
    manifest.artifacts
      .filter(isJsonObject)
      .map((artifact) => artifact.path)
      .filter((path): path is string => typeof path === 'string' && path !== 'checksums.sha256'),
  );
  if (
    checksumPaths.size !== expectedChecksumPaths.size ||
    [...expectedChecksumPaths].some((path) => !checksumPaths.has(path))
  ) {
    failures.push('checksums.sha256: entries do not match the release manifest artifact set');
  }
}

const provenance = parseStrictJson(
  await readText('build-provenance.json'),
  'release/build-provenance.json',
);
if (
  !isRecord(provenance) ||
  provenance.provenanceStatus !== 'local metadata; not a signed external attestation' ||
  !isCommit(provenance.sourceCommit) ||
  !isRecord(manifest) ||
  provenance.sourceCommit !== manifest.sourceCommit ||
  provenance.sourceTree !== manifest.sourceTree
) {
  failures.push('build provenance must bind a source commit and state that it is local metadata.');
}
const sbom = parseStrictJson(await readText('sbom.cdx.json'), 'release/sbom.cdx.json');
if (!isRecord(sbom) || sbom.bomFormat !== 'CycloneDX' || sbom.specVersion !== '1.5')
  failures.push('SBOM must be a CycloneDX 1.5 document.');
if (isRecord(sbom) && !Array.isArray(sbom.components))
  failures.push('SBOM must contain components.');

const packagePackManifest = parseStrictJson(
  await readText('package-pack-manifest.json'),
  'release/package-pack-manifest.json',
);
if (
  !isRecord(packagePackManifest) ||
  packagePackManifest.version !== 1 ||
  packagePackManifest.release !== expectedRelease ||
  !isCommit(packagePackManifest.sourceCommit) ||
  !isCommit(packagePackManifest.sourceTree) ||
  packagePackManifest.sourceCommit !== (isRecord(manifest) ? manifest.sourceCommit : undefined) ||
  packagePackManifest.sourceTree !== (isRecord(manifest) ? manifest.sourceTree : undefined) ||
  packagePackManifest.packageManager !== 'pnpm@10.6.0' ||
  !Array.isArray(packagePackManifest.packages) ||
  packagePackManifest.packages.length === 0
) {
  failures.push(
    'package-pack-manifest.json must bind all clean package packs to RC3, the release source, and pnpm@10.6.0.',
  );
} else {
  const packageNames = new Set<string>();
  for (const packageEntry of packagePackManifest.packages) {
    if (!isRecord(packageEntry)) {
      failures.push('package-pack-manifest.json contains a malformed package entry.');
      continue;
    }
    const name = packageEntry.name;
    const version = packageEntry.version;
    const tarball = packageEntry.tarball;
    const bytes = packageEntry.bytes;
    const digest = packageEntry.sha256;
    const files = packageEntry.files;
    if (
      typeof name !== 'string' ||
      typeof version !== 'string' ||
      typeof tarball !== 'string' ||
      typeof bytes !== 'number' ||
      typeof digest !== 'string' ||
      !Array.isArray(files) ||
      !files.every((file) => typeof file === 'string')
    ) {
      failures.push('package-pack-manifest.json contains an invalid package record.');
      continue;
    }
    if (packageNames.has(name)) failures.push(`duplicate packed package: ${name}`);
    packageNames.add(name);
    if (version !== expectedRelease)
      failures.push(`${name}: package version is not ${expectedRelease}.`);
    if (!tarball.startsWith('packages/') || !isWithin(releaseRoot, join(releaseRoot, tarball)))
      failures.push(`${name}: package tarball path escapes the release root.`);
    if (!files.includes('dist/index.js') || !files.includes('dist/index.d.ts'))
      failures.push(`${name}: package pack is missing compiled entrypoints.`);
    if (files.some((file) => file.startsWith('src/')))
      failures.push(`${name}: package pack contains repository source files.`);
    const artifact =
      isRecord(manifest) && Array.isArray(manifest.artifacts)
        ? manifest.artifacts.find((entry) => isRecord(entry) && entry.path === tarball)
        : undefined;
    if (!artifact) failures.push(`${name}: package tarball is absent from the release manifest.`);
    try {
      const packedBytes = await readFile(join(releaseRoot, tarball));
      if (packedBytes.length !== bytes) failures.push(`${name}: packed byte length changed.`);
      if (sha256(packedBytes) !== digest) failures.push(`${name}: packed SHA-256 changed.`);
      if (
        isRecord(artifact) &&
        (artifact.bytes !== packedBytes.length || artifact.sha256 !== digest)
      )
        failures.push(`${name}: release manifest does not match package pack metadata.`);
    } catch {
      failures.push(`${name}: package tarball is missing.`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `release check passed: ${isRecord(manifest) && Array.isArray(manifest.artifacts) ? manifest.artifacts.length : 0} RC3 artifacts and preserved RC1/RC2 evidence verified`,
  );
}

async function readText(name: string): Promise<string> {
  return readFile(join(releaseRoot, name), 'utf8');
}

function isWithin(parent: string, child: string): boolean {
  const parentPath = resolve(parent);
  const childPath = resolve(child);
  return (
    childPath === parentPath ||
    childPath.startsWith(`${parentPath}\\`) ||
    childPath.startsWith(`${parentPath}/`)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCommit(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
}

function gitCommitExists(commit: string): boolean {
  try {
    execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function gitCommitTree(commit: string): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', `${commit}^{tree}`], {
      cwd: root,
      encoding: 'utf8',
    }).replace(/(?:\r?\n)+$/u, '');
  } catch {
    return undefined;
  }
}

function sourceTreeMatchesCheckedOutSource(sourceTree: string): boolean {
  try {
    execFileSync('git', ['diff', '--quiet', sourceTree, '--', '.', ':(exclude)release/**'], {
      cwd: root,
      stdio: 'ignore',
    });
    const status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
      cwd: root,
      encoding: 'utf8',
    });
    return status
      .split(/\r?\n/u)
      .filter(Boolean)
      .every((line) => {
        const path = line.slice(3).trim().replace(/^"|"$/gu, '').replaceAll('\\', '/');
        return path === 'release' || path.startsWith('release/');
      });
  } catch {
    return false;
  }
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
