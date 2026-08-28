import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { parse, relative, resolve } from 'node:path';
import { parseStrictJson } from '@paperandslate/eom-core';

export const SECURITY_SCAN_ARTIFACTS = {
  manifest: 'reports/security-scan/scan-manifest.json',
  findings: 'reports/security-scan/findings.json',
  coverage: 'reports/security-scan/coverage.json',
  report: 'reports/security-scan/report.md',
} as const;

export const SECURITY_SCAN_PROJECTION = 'reports/security-scan.json';
const MAX_SECURITY_SCAN_ARTIFACT_BYTES = 16 * 1024 * 1024;
const MAX_SECURITY_SCAN_PROJECTION_BYTES = 4 * 1024 * 1024;

type JsonRecord = Record<string, unknown>;

export interface SecurityScanArtifactDigest {
  readonly path: string;
  readonly sha256: string;
}

export interface SecurityScanArtifactDigests {
  readonly manifest: SecurityScanArtifactDigest;
  readonly findings: SecurityScanArtifactDigest;
  readonly coverage: SecurityScanArtifactDigest;
  readonly report: SecurityScanArtifactDigest;
}

export interface CanonicalSecurityScan {
  readonly manifest: JsonRecord;
  readonly findings: JsonRecord;
  readonly coverage: JsonRecord;
  readonly report: string;
  readonly scanId: string;
  readonly targetCommit: string;
  readonly targetTree: string;
  readonly targetId: string;
  readonly producer: { readonly name: string; readonly version: string };
  readonly artifacts: SecurityScanArtifactDigests;
}

export interface SecurityScanEvidence extends CanonicalSecurityScan {
  readonly projection: JsonRecord;
}

export async function readCanonicalSecurityScan(root: string): Promise<CanonicalSecurityScan> {
  const resolvedRoot = resolve(root);
  const bytes = await Promise.all(
    Object.values(SECURITY_SCAN_ARTIFACTS).map((path) => readRegularFile(resolvedRoot, path)),
  );
  const [manifestBytes, findingsBytes, coverageBytes, reportBytes] = bytes;
  if (!manifestBytes || !findingsBytes || !coverageBytes || !reportBytes) {
    throw new Error('formal security scan canonical artifacts are incomplete');
  }

  const manifest = asRecord(
    parseStrictJson(manifestBytes.toString('utf8'), SECURITY_SCAN_ARTIFACTS.manifest),
    SECURITY_SCAN_ARTIFACTS.manifest,
  );
  const findings = asRecord(
    parseStrictJson(findingsBytes.toString('utf8'), SECURITY_SCAN_ARTIFACTS.findings),
    SECURITY_SCAN_ARTIFACTS.findings,
  );
  const coverage = asRecord(
    parseStrictJson(coverageBytes.toString('utf8'), SECURITY_SCAN_ARTIFACTS.coverage),
    SECURITY_SCAN_ARTIFACTS.coverage,
  );
  const report = reportBytes.toString('utf8');
  const scan = asRecord(manifest.scan, 'scan-manifest.json scan');
  const target = asRecord(scan.target, 'scan-manifest.json target');
  const producer = asRecord(scan.producer, 'scan-manifest.json producer');
  const scanId = requiredString(scan.id, 'scan-manifest.json scan.id');
  const targetCommit = requiredCommit(target.revision, 'scan-manifest.json target.revision');
  const targetId = requiredString(target.targetId, 'scan-manifest.json target.targetId');
  const targetTree = requiredCommit(target.tree, 'scan-manifest.json target tree');

  if (manifest.documentType !== 'codex-security.scan-manifest')
    throw new Error('scan-manifest.json has an unexpected document type');
  if (
    scan.status !== 'completed' ||
    typeof scan.sealedAt !== 'string' ||
    scan.sealedAt.length === 0
  )
    throw new Error('scan-manifest.json must describe a sealed completed scan');
  if (target.kind !== 'git_revision')
    throw new Error('scan-manifest.json target must be a git revision');
  if (typeof scan.coverageRef !== 'string' || scan.coverageRef !== 'coverage.json')
    throw new Error('scan-manifest.json coverageRef must be coverage.json');
  if (typeof scan.findingsRef !== 'string' || scan.findingsRef !== 'findings.json')
    throw new Error('scan-manifest.json findingsRef must be findings.json');
  const producerName = requiredString(producer.name, 'scan-manifest.json producer.name');
  const producerVersion = requiredString(producer.version, 'scan-manifest.json producer.version');
  if (producerName !== 'codex-security-plugin')
    throw new Error('scan-manifest.json was not produced by the Codex Security plugin');

  const findingsScanId = requiredString(findings.scanId, 'findings.json scanId');
  if (
    findings.documentType !== 'codex-security.findings' ||
    findingsScanId !== scanId ||
    findings.schemaVersion !== '1.0'
  ) {
    throw new Error('findings.json does not match the sealed scan manifest');
  }
  if (!Array.isArray(findings.findings) || findings.findings.length !== 0) {
    throw new Error('formal security scan evidence must contain zero findings');
  }

  const coverageScanId = requiredString(coverage.scanId, 'coverage.json scanId');
  if (
    coverage.documentType !== 'codex-security.coverage' ||
    coverageScanId !== scanId ||
    coverage.schemaVersion !== '1.0' ||
    coverage.completeness !== 'complete' ||
    !Array.isArray(coverage.deferred) ||
    coverage.deferred.length !== 0 ||
    !Array.isArray(coverage.explicitExclusions) ||
    coverage.explicitExclusions.length !== 0
  ) {
    throw new Error('coverage.json is incomplete or does not match the sealed scan manifest');
  }
  if (!report.includes(targetCommit) || !report.includes(targetTree)) {
    throw new Error('security-scan/report.md does not identify the sealed scan target');
  }

  const manifestArtifacts = artifactEntries(scan.artifacts);
  const artifacts: SecurityScanArtifactDigests = {
    manifest: { path: SECURITY_SCAN_ARTIFACTS.manifest, sha256: sha256(manifestBytes) },
    findings: artifactDigest(SECURITY_SCAN_ARTIFACTS.findings, manifestArtifacts, findingsBytes),
    coverage: artifactDigest(SECURITY_SCAN_ARTIFACTS.coverage, manifestArtifacts, coverageBytes),
    report: { path: SECURITY_SCAN_ARTIFACTS.report, sha256: sha256(reportBytes) },
  };

  return {
    manifest,
    findings,
    coverage,
    report,
    scanId,
    targetCommit,
    targetTree,
    targetId,
    producer: { name: producerName, version: producerVersion },
    artifacts,
  };
}

export async function readSecurityScanEvidence(root: string): Promise<SecurityScanEvidence> {
  const canonical = await readCanonicalSecurityScan(root);
  const projectionBytes = await readRegularFile(
    resolve(root),
    SECURITY_SCAN_PROJECTION,
    MAX_SECURITY_SCAN_PROJECTION_BYTES,
  );
  const projection = asRecord(
    parseStrictJson(projectionBytes.toString('utf8'), SECURITY_SCAN_PROJECTION),
    SECURITY_SCAN_PROJECTION,
  );
  const coverage = asRecord(projection.coverage, 'security-scan.json coverage');
  const projectionArtifacts = asRecord(
    coverage.canonicalArtifacts,
    'security-scan.json coverage.canonicalArtifacts',
  );
  const projectionHashes = asRecord(
    coverage.canonicalArtifactSha256,
    'security-scan.json coverage.canonicalArtifactSha256',
  );
  const projectionProducer = asRecord(projection.producer, 'security-scan.json producer');

  if (
    projection.version !== 1 ||
    projection.status !== 'pass' ||
    projection.scanType !== 'standard' ||
    projection.scanId !== canonical.scanId ||
    projection.targetCommit !== canonical.targetCommit ||
    projection.targetTree !== canonical.targetTree ||
    projection.targetKind !== 'git_revision' ||
    projection.targetId !== canonical.targetId ||
    projectionProducer.name !== canonical.producer.name ||
    projectionProducer.version !== canonical.producer.version ||
    projection.unresolvedFindingCount !== 0 ||
    projection.findingCount !== 0 ||
    coverage.completeness !== 'complete' ||
    !Array.isArray(coverage.deferred) ||
    coverage.deferred.length !== 0
  ) {
    throw new Error('security-scan.json does not match the sealed canonical scan artifacts');
  }

  for (const name of Object.keys(SECURITY_SCAN_ARTIFACTS) as Array<
    keyof typeof SECURITY_SCAN_ARTIFACTS
  >) {
    if (projectionArtifacts[name] !== SECURITY_SCAN_ARTIFACTS[name]) {
      throw new Error(`security-scan.json has an invalid canonical artifact path for ${name}`);
    }
    if (projectionHashes[name] !== canonical.artifacts[name].sha256) {
      throw new Error(`security-scan.json has an invalid canonical artifact digest for ${name}`);
    }
  }

  const severityCounts = asRecord(projection.severityCounts, 'security-scan.json severityCounts');
  for (const severity of ['critical', 'high', 'medium', 'low']) {
    if (severityCounts[severity] !== 0) {
      throw new Error(`security-scan.json reports a non-zero ${severity} finding count`);
    }
  }

  return { ...canonical, projection };
}

export function securityScanArtifactDigestsMatch(
  value: unknown,
  expected: SecurityScanArtifactDigests,
): boolean {
  if (!isRecord(value)) return false;
  for (const name of Object.keys(expected) as Array<keyof SecurityScanArtifactDigests>) {
    const actual = value[name];
    if (
      !isRecord(actual) ||
      actual.path !== expected[name].path ||
      actual.sha256 !== expected[name].sha256
    )
      return false;
  }
  return true;
}

export function createSecurityScanProjection(canonical: CanonicalSecurityScan): JsonRecord {
  return {
    version: 1,
    status: 'pass',
    scanType: 'standard',
    scanId: canonical.scanId,
    targetCommit: canonical.targetCommit,
    targetTree: canonical.targetTree,
    targetPath: '.',
    targetKind: 'git_revision',
    targetId: canonical.targetId,
    unresolvedFindingCount: 0,
    findingCount: 0,
    severityCounts: { critical: 0, high: 0, medium: 0, low: 0 },
    coverage: {
      completeness: 'complete',
      includedPaths: ['.'],
      excludedPaths: [],
      deferred: [],
      canonicalArtifacts: Object.fromEntries(
        Object.entries(SECURITY_SCAN_ARTIFACTS).map(([name, path]) => [name, path]),
      ),
      canonicalArtifactSha256: {
        manifest: canonical.artifacts.manifest.sha256,
        findings: canonical.artifacts.findings.sha256,
        coverage: canonical.artifacts.coverage.sha256,
        report: canonical.artifacts.report.sha256,
      },
    },
    producer: canonical.producer,
    externalGates: {
      ianaRegistration: 'blocked-external',
      independentInteroperability: 'blocked-external',
      legalGovernanceApproval: 'blocked-external',
      deploymentProductionAdoption: 'blocked-external',
    },
    evidencePolicy:
      'This projection is generated from the sealed Standard scan artifacts. Verification requires the producer, scan identity, target identity, zero-finding counts, and SHA-256 digests of every canonical artifact to agree.',
    limitations: extractLimitations(canonical.manifest),
  };
}

export function renderSecurityScanProjection(canonical: CanonicalSecurityScan): string {
  const limitations = extractLimitations(canonical.manifest);
  return [
    '# Formal Standard security scan',
    '',
    '- Result: passed with zero reportable findings',
    `- Scan ID: ${canonical.scanId}`,
    `- Target commit: ${canonical.targetCommit}`,
    `- Target tree: ${canonical.targetTree}`,
    `- Target ID: ${canonical.targetId}`,
    `- Producer: ${canonical.producer.name} ${canonical.producer.version}`,
    '- Coverage: complete',
    '',
    'The detailed report and sealed canonical inputs are preserved under [`security-scan/`](security-scan/).',
    'Verification binds this projection to those files using their recorded SHA-256 digests; report prose alone is not evidence.',
    '',
    '## Limitations',
    '',
    ...(limitations.length > 0 ? limitations.map((value) => `- ${value}`) : ['- None recorded.']),
    '',
  ].join('\n');
}

async function readRegularFile(
  root: string,
  path: string,
  maxBytes = MAX_SECURITY_SCAN_ARTIFACT_BYTES,
): Promise<Buffer> {
  const resolvedRoot = resolve(root);
  const absolute = resolve(resolvedRoot, path);
  const suffix = relative(resolvedRoot, absolute);
  if (suffix === '..' || suffix.startsWith(`..${'\\'}`) || suffix.startsWith('../')) {
    throw new Error(`security scan artifact escapes its root: ${path}`);
  }
  const rootInformation = await lstat(resolvedRoot);
  if (!rootInformation.isDirectory() || rootInformation.isSymbolicLink()) {
    throw new Error(`security scan evidence root must be a real directory: ${resolvedRoot}`);
  }
  const canonicalRoot = await realpath(resolvedRoot);
  const canonicalPath = await realpath(absolute);
  const canonicalSuffix = relative(canonicalRoot, canonicalPath);
  if (
    canonicalSuffix === '..' ||
    canonicalSuffix.startsWith(`..${'\\'}`) ||
    canonicalSuffix.startsWith('../') ||
    parse(canonicalSuffix).root.length > 0
  ) {
    throw new Error(`security scan artifact escapes its root through a symbolic link: ${path}`);
  }
  const information = await lstat(absolute);
  if (!information.isFile() || information.isSymbolicLink()) {
    throw new Error(`security scan artifact must be a regular file: ${path}`);
  }
  if (information.size > maxBytes) {
    throw new Error(`security scan artifact exceeds its ${maxBytes}-byte limit: ${path}`);
  }
  return readFile(absolute);
}

function artifactEntries(value: unknown): Map<string, string> {
  if (!Array.isArray(value)) throw new Error('scan-manifest.json artifacts must be an array');
  const entries = new Map<string, string>();
  for (const entry of value) {
    const record = asRecord(entry, 'scan-manifest.json artifact');
    const path = requiredString(record.path, 'scan-manifest.json artifact.path');
    const digest = requiredDigest(record.sha256, `scan-manifest.json artifact ${path}`);
    if (entries.has(path)) throw new Error(`scan-manifest.json repeats artifact ${path}`);
    entries.set(path, digest);
  }
  if (entries.size !== 2 || !entries.has('findings.json') || !entries.has('coverage.json')) {
    throw new Error('scan-manifest.json must seal exactly findings.json and coverage.json');
  }
  return entries;
}

function artifactDigest(
  path: string,
  entries: Map<string, string>,
  bytes: Buffer,
): SecurityScanArtifactDigest {
  const expected = entries.get(path.replace('reports/security-scan/', ''));
  if (!expected) throw new Error(`scan-manifest.json does not seal ${path}`);
  const actual = sha256(bytes);
  if (actual !== expected) throw new Error(`sealed digest mismatch for ${path}`);
  return { path, sha256: actual };
}

function extractLimitations(manifest: JsonRecord): string[] {
  const scan = isRecord(manifest.scan) ? manifest.scan : undefined;
  const scope = scan && isRecord(scan.scope) ? scan.scope : undefined;
  return scope && Array.isArray(scope.limitations)
    ? scope.limitations.filter((value): value is string => typeof value === 'string')
    : [];
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`${label} must be non-empty`);
  return value;
}

function requiredCommit(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/u.test(value))
    throw new Error(`${label} must be a full commit identifier`);
  return value;
}

function requiredDigest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value))
    throw new Error(`${label} must be a SHA-256 digest`);
  return value;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
