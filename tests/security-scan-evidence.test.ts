import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { format as formatPrettier } from 'prettier';
import { describe, expect, it } from 'vitest';
import {
  createSecurityScanProjection,
  readSecurityScanEvidence,
  type CanonicalSecurityScan,
} from '../scripts/security-scan-evidence.js';

describe('sealed security-scan evidence', () => {
  it('requires the projection and every canonical artifact to agree', async () => {
    const root = await createFixture();
    try {
      const evidence = await readSecurityScanEvidence(root);
      expect(evidence.scanId).toBe('11111111-1111-4111-8111-111111111111');
      expect(evidence.targetCommit).toBe('a'.repeat(40));
      expect(evidence.targetTree).toBe('b'.repeat(40));
      expect(evidence.artifacts.report.sha256).toMatch(/^[a-f0-9]{64}$/u);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a projection whose self-asserted scan identity is changed', async () => {
    const root = await createFixture();
    try {
      const path = join(root, 'reports', 'security-scan.json');
      const projection = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
      projection.scanId = '22222222-2222-4222-8222-222222222222';
      await writeFile(path, `${JSON.stringify(projection, null, 2)}\n`, 'utf8');
      await expect(readSecurityScanEvidence(root)).rejects.toThrow(
        'does not match the sealed canonical scan artifacts',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects canonical content changed without a matching sealed digest', async () => {
    const root = await createFixture();
    try {
      const path = join(root, 'reports', 'security-scan', 'findings.json');
      await writeFile(path, `${await readFile(path, 'utf8')}\n`, 'utf8');
      await expect(readSecurityScanEvidence(root)).rejects.toThrow(
        'sealed digest mismatch for reports/security-scan/findings.json',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps the checked-in projection in repository formatter form', async () => {
    const path = join(process.cwd(), 'reports', 'security-scan.json');
    const source = await readFile(path, 'utf8');
    await expect(formatPrettier(source, { filepath: path, parser: 'json' })).resolves.toBe(source);
  });
});

async function createFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'eom-security-evidence-'));
  const scanRoot = join(root, 'reports', 'security-scan');
  await mkdir(scanRoot, { recursive: true });
  const scanId = '11111111-1111-4111-8111-111111111111';
  const targetCommit = 'a'.repeat(40);
  const targetTree = 'b'.repeat(40);
  const findings = {
    documentType: 'codex-security.findings',
    findings: [],
    scanId,
    schemaVersion: '1.0',
  };
  const coverage = {
    completeness: 'complete',
    deferred: [],
    documentType: 'codex-security.coverage',
    explicitExclusions: [],
    includePaths: ['.'],
    scanId,
    schemaVersion: '1.0',
    surfaces: [],
  };
  const findingsBytes = jsonBytes(findings);
  const coverageBytes = jsonBytes(coverage);
  const manifest = {
    documentType: 'codex-security.scan-manifest',
    scan: {
      artifacts: [
        { mediaType: 'application/json', path: 'findings.json', sha256: sha256(findingsBytes) },
        { mediaType: 'application/json', path: 'coverage.json', sha256: sha256(coverageBytes) },
      ],
      coverageRef: 'coverage.json',
      findingsRef: 'findings.json',
      id: scanId,
      producer: { name: 'codex-security-plugin', version: '0.1.22' },
      sealedAt: '2026-08-27T00:00:00.000Z',
      scope: { limitations: [], summary: `scan for ${targetCommit} with tree ${targetTree}` },
      status: 'completed',
      target: {
        kind: 'git_revision',
        targetId: 'target_sha256_fixture',
        revision: targetCommit,
        tree: targetTree,
      },
    },
    schemaVersion: '1.0',
  };
  const manifestBytes = jsonBytes(manifest);
  const report = `# Security Review\n\nTarget ${targetCommit} with tree ${targetTree}.\n`;
  const canonical: CanonicalSecurityScan = {
    manifest,
    findings,
    coverage,
    report,
    scanId,
    targetCommit,
    targetTree,
    targetId: 'target_sha256_fixture',
    producer: { name: 'codex-security-plugin', version: '0.1.22' },
    artifacts: {
      manifest: {
        path: 'reports/security-scan/scan-manifest.json',
        sha256: sha256(manifestBytes),
      },
      findings: {
        path: 'reports/security-scan/findings.json',
        sha256: sha256(findingsBytes),
      },
      coverage: {
        path: 'reports/security-scan/coverage.json',
        sha256: sha256(coverageBytes),
      },
      report: {
        path: 'reports/security-scan/report.md',
        sha256: sha256(Buffer.from(report, 'utf8')),
      },
    },
  };
  await writeFile(join(scanRoot, 'scan-manifest.json'), manifestBytes);
  await writeFile(join(scanRoot, 'findings.json'), findingsBytes);
  await writeFile(join(scanRoot, 'coverage.json'), coverageBytes);
  await writeFile(join(scanRoot, 'report.md'), report, 'utf8');
  await writeFile(
    join(root, 'reports', 'security-scan.json'),
    `${JSON.stringify(createSecurityScanProjection(canonical), null, 2)}\n`,
    'utf8',
  );
  return root;
}

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
