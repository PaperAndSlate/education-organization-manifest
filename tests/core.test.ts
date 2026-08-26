import { describe, expect, it } from 'vitest';
import {
  isPathWithin,
  isPrivateOrLocalHostname,
  normalizeLocalized,
  parseStrictJson,
} from '@paperandslate/eom-core';

describe('EOM core primitives', () => {
  it('rejects duplicate JSON object keys before publication validation', () => {
    expect(() => parseStrictJson('{"id":1,"id":2}', 'duplicate.json')).toThrow(
      /Duplicate JSON object key/iu,
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
});
