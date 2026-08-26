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
});
