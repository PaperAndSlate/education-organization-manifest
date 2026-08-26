import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { parseStrictJson } from '@paperandslate/eom-core';
import {
  CONFORMANCE_PROFILES,
  conformanceReportSummary,
  runConformance,
} from '@paperandslate/eom-testkit';
import { validateDocument } from '@paperandslate/eom-validator';

describe('EOM offline conformance testkit', () => {
  it('runs the complete fictional Ecme publication through the core publisher profile', async () => {
    const report = await runConformance({
      directory: resolve('examples/ecme-high/public'),
      now: new Date('2027-01-01T00:00:00Z'),
    });
    expect(report.status).toBe('conforming');
    expect(report.profile).toBe(CONFORMANCE_PROFILES['publisher-core'].uri);
    expect(validateDocument(report).valid, JSON.stringify(validateDocument(report).findings)).toBe(
      true,
    );
    expect(conformanceReportSummary(report).checks).toMatchObject({ fail: 0, warn: 0 });
    expect(report.checks.length).toBeGreaterThan(70);
  });

  it('produces a valid diagnostic report for an invalid capture without network access', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-conformance-invalid-'));
    try {
      await writeFile(
        join(root, 'unknown-type.json'),
        await readFile(resolve('fixtures/conformance/invalid/unknown-type.json'), 'utf8'),
        'utf8',
      );
      const report = await runConformance({ directory: root });
      expect(report.status).toBe('non-conforming');
      expect(report.checks.some((check) => check.status === 'fail')).toBe(true);
      expect(validateDocument(report).valid).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('exposes every versioned role/profile required by the conformance model', () => {
    expect(Object.keys(CONFORMANCE_PROFILES).sort()).toEqual([
      'consumer-core',
      'generator',
      'module',
      'publisher-core',
      'signature-optional',
      'validator',
    ]);
    expect(
      parseStrictJson(
        readFileSync('fixtures/conformance/expected/ecme-high.json', 'utf8'),
        'expected',
      ),
    ).toMatchObject({
      status: 'conforming',
    });
  });
});
