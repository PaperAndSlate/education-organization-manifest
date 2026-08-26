import { describe, expect, it } from 'vitest';
import {
  semanticDiff,
  isPathWithin,
  isPrivateOrLocalHostname,
  normalizeLocalized,
  parseStrictJson,
  StrictJsonError,
} from '@paperandslate/eom-core';

describe('EOM core primitives', () => {
  it('rejects duplicate JSON object keys before publication validation', () => {
    expect(() => parseStrictJson('{"id":1,"id":2}', 'duplicate.json')).toThrow(
      /Duplicate JSON object key/iu,
    );
  });

  it('rejects unpaired Unicode surrogates in parsed JSON values', () => {
    expect(() => parseStrictJson('{"name":"\\ud800"}', 'unicode.json')).toThrow(
      /unpaired UTF-16 surrogate/iu,
    );
  });

  it('keeps malformed object-key escapes inside the strict JSON error contract', () => {
    expect(() => parseStrictJson('{"\\uZZZZ":1}', 'malformed-key.json')).toThrow(StrictJsonError);
  });

  it('rejects deeply nested JSON without overflowing the call stack', () => {
    const nested = `${'['.repeat(129)}0${']'.repeat(129)}`;
    expect(() => parseStrictJson(nested, 'deep.json')).toThrow(
      /nesting exceeds the 128-level safety limit/iu,
    );
  });

  it('normalizes localized values and keeps direction metadata', () => {
    expect(
      normalizeLocalized({ default: 'ar', values: { ar: 'مدرسة' }, directions: { ar: 'rtl' } }),
    ).toEqual({
      default: 'ar',
      values: { ar: 'مدرسة' },
      directions: { ar: 'rtl' },
    });
    expect(normalizeLocalized('School')).toBeUndefined();
    expect(normalizeLocalized('School', 'en-US')).toEqual({
      default: 'en-US',
      values: { 'en-US': 'School' },
    });
    expect(
      normalizeLocalized({
        default: 'en-US',
        values: { 'en-US': 'School' },
        directions: { 'bad tag': 'rtl' },
      }),
    ).toEqual({ default: 'en-US', values: { 'en-US': 'School' } });
  });

  it('checks scoped URLs and local/private hosts', () => {
    expect(
      isPathWithin('https://school.example/eom/course.json', 'https://school.example', ['/eom']),
    ).toBe(true);
    expect(
      isPathWithin('https://other.example/eom/course.json', 'https://school.example', ['/eom']),
    ).toBe(false);
    expect(isPrivateOrLocalHostname('localhost')).toBe(true);
    expect(isPrivateOrLocalHostname('school.example')).toBe(false);
  });

  it('does not report object-key ordering as a semantic change', () => {
    const result = semanticDiff(
      {
        type: 'resource',
        id: 'https://school.example/id/resource',
        name: 'A',
        details: { b: 2, a: 1 },
      },
      {
        details: { a: 1, b: 2 },
        name: 'A',
        id: 'https://school.example/id/resource',
        type: 'resource',
      },
    );
    expect(result.changes).toHaveLength(0);
    expect(result.compatible).toBe(true);
  });
});
