import { describe, expect, it } from 'vitest';
import {
  isAbsoluteUri,
  isBcp47,
  isPathWithin,
  isSameOrigin,
  normalizeLocalized,
  parseStrictJson,
  semanticDiff,
  stringifyCanonical,
  type JsonValue,
} from '@paperandslate/eom-core';

describe('EOM deterministic property and fuzz coverage', () => {
  it('round-trips generated JSON values and canonicalizes object key order', () => {
    const random = seededRandom(0xe0_01);
    for (let index = 0; index < 250; index += 1) {
      const value = randomJson(random, 0);
      const text = JSON.stringify(value);
      const parsed = parseStrictJson(text, `property-${index}.json`);
      expect(stringifyCanonical(parsed)).toBe(stringifyCanonical(value));
      expect(stringifyCanonical(parsed)).toBe(stringifyCanonical(parseStrictJson(text)));
    }
  });

  it('rejects generated duplicate keys, malformed structures, and unsafe primitive forms', () => {
    const keys = ['id', 'a/b', 'tilde~key', '学校', 'quote"key'];
    for (const key of keys) {
      const encoded = JSON.stringify(key);
      expect(() => parseStrictJson(`{${encoded}:1,${encoded}:2}`)).toThrow(
        /Duplicate JSON object key/iu,
      );
    }
    for (const text of ['{"a":}', '{"a":1,}', '[1,]', '{"a":1} trailing', '']) {
      expect(() => parseStrictJson(text)).toThrow();
    }
    expect(isAbsoluteUri('https://school.example/a%20b')).toBe(true);
    expect(isAbsoluteUri('https://school.example/a b')).toBe(false);
    expect(isAbsoluteUri('javascript:alert(1)')).toBe(true);
    expect(isAbsoluteUri('not an uri')).toBe(false);
  });

  it('keeps URI boundary, localization, and Unicode invariants stable', () => {
    const origins = [
      ['https://SCHOOL.EXAMPLE', 'https://school.example/'],
      ['https://school.example:443/a', 'https://school.example/b'],
      ['https://school.example:8443/a', 'https://school.example/b'],
    ] as const;
    expect(origins.map(([left, right]) => isSameOrigin(left, right))).toEqual([true, true, false]);
    expect(isPathWithin('https://school.example/eom/a', 'https://school.example', ['/eom'])).toBe(
      true,
    );
    expect(
      isPathWithin('https://school.example/eom-archive/a', 'https://school.example', ['/eom']),
    ).toBe(false);
    expect(isPathWithin('https://school.example/%E2%9C%93', 'https://school.example', ['/'])).toBe(
      true,
    );
    expect(isBcp47('ar-EG')).toBe(true);
    expect(isBcp47('ar_EG')).toBe(false);
    expect(
      normalizeLocalized({
        default: 'ar',
        values: { ar: 'مدرسة', 'ar-EG': 'مدرسة مصرية' },
        directions: { ar: 'rtl', 'ar-EG': 'rtl' },
      }),
    ).toEqual({
      default: 'ar',
      values: { ar: 'مدرسة', 'ar-EG': 'مدرسة مصرية' },
      directions: { ar: 'rtl', 'ar-EG': 'rtl' },
    });
  });

  it('uses escaped JSON pointers and id-aware arrays independent of enumeration order', () => {
    const before = {
      type: 'course-catalog',
      items: [
        { id: 'https://school.example/course/a', name: 'A' },
        { id: 'https://school.example/course/x~y/z', name: 'X' },
      ],
    };
    const after = {
      items: [
        { name: 'X updated', id: 'https://school.example/course/x~y/z' },
        { id: 'https://school.example/course/a', name: 'A' },
      ],
      type: 'course-catalog',
    };
    const diff = semanticDiff(before, after);
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0]?.path).toBe('/items/@id/https:~1~1school.example~1course~1x~0y~1z/name');
    expect(diff.breaking).toBe(false);
  });
});

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function randomJson(random: () => number, depth: number): JsonValue {
  if (depth >= 3) {
    return randomPrimitive(random);
  }
  const choice = Math.floor(random() * 5);
  if (choice === 0) return randomPrimitive(random);
  if (choice === 1) {
    return Array.from({ length: Math.floor(random() * 4) }, () => randomJson(random, depth + 1));
  }
  const result: Record<string, JsonValue> = {};
  const keys = ['a', 'z', 'unicode-学校', `key-${Math.floor(random() * 20)}`];
  for (const key of keys.slice(0, Math.floor(random() * (keys.length + 1)))) {
    result[key] = randomJson(random, depth + 1);
  }
  return result;
}

function randomPrimitive(random: () => number): JsonValue {
  const choice = Math.floor(random() * 5);
  if (choice === 0) return null;
  if (choice === 1) return random() > 0.5;
  if (choice === 2) return Math.floor(random() * 10_000) - 5_000;
  if (choice === 3) return `value-${Math.floor(random() * 100)}-学校`;
  return '';
}
