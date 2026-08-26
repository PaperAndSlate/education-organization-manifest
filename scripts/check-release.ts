import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isJsonObject, parseStrictJson } from '@paperandslate/eom-core';

const root = resolve(process.cwd());
const releaseRoot = join(root, 'release');
const expectedRelease = '1.0.0-rc.2';
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
  if (
    !isRecord(manifest.historicalSuperseded) ||
    manifest.historicalSuperseded.release !== '1.0.0-rc.1' ||
    manifest.historicalSuperseded.status !== 'preserved-immutable-superseded'
  ) {
    failures.push('release manifest must identify preserved RC1 evidence as superseded.');
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
  !isCommit(provenance.sourceCommit)
) {
  failures.push('build provenance must bind a source commit and state that it is local metadata.');
}
const sbom = parseStrictJson(await readText('sbom.cdx.json'), 'release/sbom.cdx.json');
if (!isRecord(sbom) || sbom.bomFormat !== 'CycloneDX' || sbom.specVersion !== '1.5')
  failures.push('SBOM must be a CycloneDX 1.5 document.');
if (isRecord(sbom) && !Array.isArray(sbom.components))
  failures.push('SBOM must contain components.');

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `release check passed: ${isRecord(manifest) && Array.isArray(manifest.artifacts) ? manifest.artifacts.length : 0} RC2 artifacts and preserved RC1 evidence verified`,
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

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
