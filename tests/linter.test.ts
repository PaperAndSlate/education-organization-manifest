import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseStrictJson } from '@paperandslate/eom-core';
import { lintPublication, provenanceFindings } from '@paperandslate/eom-linter';

describe('EOM privacy and quality linting', () => {
  it('flags public student data', () => {
    const value = parseStrictJson(
      readFileSync(resolve('fixtures/invalid/privacy/student-data.json'), 'utf8'),
    );
    const findings = lintPublication(value);
    expect(
      findings.some(
        (item) => item.code === 'EOM_PRIVACY_PROHIBITED_FIELD' && item.severity === 'error',
      ),
    ).toBe(true);
  });

  it('flags prohibited privacy fields regardless of naming style', () => {
    const findings = lintPublication({
      private_schedule: [{ id: 'https://school.example/id/private-schedule' }],
      privateTransportAssignment: { id: 'https://school.example/id/private-assignment' },
    });
    expect(findings.filter((item) => item.code === 'EOM_PRIVACY_PROHIBITED_FIELD')).toHaveLength(2);
  });

  it('does not allow strict-privacy options to downgrade prohibited fields', () => {
    const findings = lintPublication(
      { student: { id: 'public-test-marker' } },
      { strictPrivacy: false },
    );
    expect(
      findings.some(
        (item) => item.code === 'EOM_PRIVACY_PROHIBITED_FIELD' && item.severity === 'error',
      ),
    ).toBe(true);
  });

  it('warns when a publication has no expiry', () => {
    const findings = lintPublication({ type: 'manifest', id: 'https://school.example/id' });
    expect(
      findings.some(
        (item) => item.code === 'EOM_LINT_MISSING_EXPIRY' && item.severity === 'warning',
      ),
    ).toBe(true);
  });

  it('flags private and insecure links', () => {
    const findings = lintPublication({
      type: 'manifest',
      expires: '2030-01-01T00:00:00Z',
      href: 'http://localhost/admin',
    });
    expect(findings.some((item) => item.code === 'EOM_LINT_HTTPS_REQUIRED')).toBe(true);
  });

  it('flags reserved public-looking IP literals before network retrieval', () => {
    const findings = lintPublication({
      type: 'manifest',
      expires: '2030-01-01T00:00:00Z',
      href: 'https://169.254.169.254/latest/meta-data',
    });
    expect(findings.some((item) => item.code === 'EOM_LINT_PRIVATE_HOST')).toBe(true);
  });

  it('checks embedded provenance target pointers', () => {
    const findings = provenanceFindings({
      provenance: [
        {
          scope: 'field',
          targetPointers: ['/items/0~2/name'],
        },
      ],
    });
    expect(findings.some((item) => item.code === 'EOM_PROVENANCE_POINTER_INVALID')).toBe(true);
  });

  it('fails closed for cyclic and oversized runtime values', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(lintPublication(cyclic).some((item) => item.code === 'EOM_LINT_CYCLIC_VALUE')).toBe(
      true,
    );
    const cyclicArray: unknown[] = [];
    cyclicArray.push(cyclicArray);
    expect(lintPublication(cyclicArray).some((item) => item.code === 'EOM_LINT_CYCLIC_VALUE')).toBe(
      true,
    );
    expect(
      lintPublication(Array.from({ length: 100_001 }, () => ({ value: true }))).some(
        (item) => item.code === 'EOM_LINT_RESOURCE_LIMIT' && item.severity === 'error',
      ),
    ).toBe(true);
  });

  it('rejects sparse runtime arrays instead of silently skipping entries', () => {
    const value = [] as unknown[];
    value.length = 2;
    expect(
      lintPublication({ items: value }).some((item) => item.code === 'EOM_LINT_SPARSE_ARRAY'),
    ).toBe(true);
    expect(
      provenanceFindings({ provenance: value }).some(
        (item) => item.code === 'EOM_LINT_SPARSE_ARRAY',
      ),
    ).toBe(true);
  });

  it('rejects non-plain runtime objects instead of treating them as empty JSON', () => {
    const findings = lintPublication(new Date('2027-01-01T00:00:00Z'));
    expect(findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EOM_LINT_NON_JSON_VALUE' })]),
    );
  });
});
