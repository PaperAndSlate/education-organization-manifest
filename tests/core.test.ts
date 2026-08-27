import { describe, expect, it } from 'vitest';
import {
  semanticDiff,
  isHttpsUri,
  isPathWithin,
  isPrivateOrLocalHostname,
  normalizeLocalized,
  parseStrictJson,
  stringifyCanonical,
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

  it('rejects non-finite JSON numbers in parsed and canonicalized values', () => {
    expect(() => parseStrictJson('1e400', 'nonfinite.json')).toThrow(/non-finite number/iu);
    expect(() => stringifyCanonical({ value: Number.POSITIVE_INFINITY })).toThrow(
      /non-finite number/iu,
    );
  });

  it('rejects undefined and non-plain runtime values instead of dropping or coercing them', () => {
    expect(() => stringifyCanonical({ value: undefined } as never)).toThrow(
      /undefined object property/iu,
    );
    expect(() => stringifyCanonical({ value: new Date() } as never)).toThrow(/non-plain object/iu);
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

  it('rejects oversized parsed JSON graphs before materializing them', () => {
    const values = `[${Array.from({ length: 100_001 }, () => '0').join(',')}]`;
    expect(() => parseStrictJson(values, 'nodes.json')).toThrow(/node safety limit/iu);
  });

  it('preserves prototype-looking JSON keys during canonical output', () => {
    const parsed = parseStrictJson('{"__proto__":{"polluted":true},"safe":1}');
    expect(stringifyCanonical(parsed)).toContain('"__proto__"');
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('rejects cyclic, deeply nested, and oversized runtime graphs before recursion', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => stringifyCanonical(cyclic as never)).toThrow(/cyclic runtime value/iu);
    expect(() => semanticDiff(cyclic, {})).toThrow(/cyclic runtime value/iu);

    let nested: unknown = 0;
    for (let index = 0; index < 129; index += 1) nested = [nested];
    expect(() => stringifyCanonical(nested as never)).toThrow(
      /nesting exceeds the 128-level safety limit/iu,
    );

    expect(() => stringifyCanonical(Array.from({ length: 100_001 }, () => 0) as never)).toThrow(
      /node safety limit/iu,
    );
  });

  it('rejects sparse runtime arrays instead of canonicalizing missing elements as data', () => {
    const sparse: unknown[] = [];
    sparse.length = 1;
    expect(() => stringifyCanonical(sparse as never)).toThrow(/sparse array/iu);
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
    expect(isPrivateOrLocalHostname('169.254.169.254')).toBe(true);
    expect(isPrivateOrLocalHostname('[fe80::1]')).toBe(true);
    expect(isPrivateOrLocalHostname('::ffff:169.254.169.254')).toBe(true);
    expect(isPrivateOrLocalHostname('school.example')).toBe(false);
    expect(isHttpsUri('https://school.example/eom/resource.json')).toBe(true);
    expect(isHttpsUri('https://user:password@school.example/eom/resource.json')).toBe(false);
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
