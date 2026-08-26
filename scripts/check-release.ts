import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isJsonObject, parseStrictJson } from '@paperandslate/eom-core';

const root = resolve(process.cwd());
const releaseRoot = join(root, 'release');
const manifestPath = join(releaseRoot, 'manifest.json');
const manifest = parseStrictJson(await readFile(manifestPath, 'utf8'), 'release/manifest.json');
if (!isRecord(manifest) || !Array.isArray(manifest.artifacts)) {
  throw new Error('release/manifest.json must contain an artifacts array.');
}
const failures: string[] = [];
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
  const path = join(releaseRoot, artifact.path);
  if (!path.startsWith(releaseRoot + '\\') && !path.startsWith(`${releaseRoot}/`)) {
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
if (manifest.protocolStatus !== 'working-draft')
  failures.push('release manifest must retain working-draft status');
if (
  !isRecord(manifest.externalGates) ||
  manifest.externalGates.ianaRegistration !== 'blocked-external'
) {
  failures.push('release manifest must mark IANA registration as blocked-external');
}
const checksums = await readFile(join(releaseRoot, 'checksums.sha256'), 'utf8');
const checksumPaths = new Set<string>();
for (const line of checksums.trim().split(/\r?\n/u)) {
  const match = /^(?<hash>[a-f0-9]{64})  (?<path>.+)$/u.exec(line);
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
  checksumPaths.add(checksumPath);
  const absoluteChecksumPath = join(releaseRoot, checksumPath);
  if (
    !absoluteChecksumPath.startsWith(releaseRoot + '\\') &&
    !absoluteChecksumPath.startsWith(`${releaseRoot}/`)
  ) {
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
const expectedChecksumPaths = new Set<string>();
for (const artifact of manifest.artifacts) {
  if (
    isJsonObject(artifact) &&
    typeof artifact.path === 'string' &&
    artifact.path !== 'checksums.sha256'
  ) {
    expectedChecksumPaths.add(artifact.path);
  }
}
if (
  checksumPaths.size !== expectedChecksumPaths.size ||
  [...expectedChecksumPaths].some((path) => !checksumPaths.has(path))
) {
  failures.push('checksums.sha256: entries do not match the release manifest artifact set');
}
const provenance = parseStrictJson(
  await readFile(join(releaseRoot, 'build-provenance.json'), 'utf8'),
  'release/build-provenance.json',
);
if (
  !isRecord(provenance) ||
  provenance.provenanceStatus !== 'local metadata; not a signed external attestation'
) {
  failures.push(
    'build provenance must state that it is local metadata, not an external attestation',
  );
}
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `release check passed: ${manifest.artifacts.length} immutable/checksummed artifacts verified`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
