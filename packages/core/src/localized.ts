import type { JsonObject } from './json.js';

export const BCP47_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;

export type TextDirection = 'ltr' | 'rtl' | 'auto';

export interface LocalizedValue {
  readonly default: string;
  readonly values: Readonly<Record<string, string>>;
  readonly directions?: Readonly<Record<string, TextDirection>>;
}

export function isBcp47(value: unknown): value is string {
  return typeof value === 'string' && BCP47_PATTERN.test(value);
}

export function normalizeLocalized(
  value: unknown,
  defaultLanguage?: string,
): LocalizedValue | undefined {
  if (
    typeof value === 'string' &&
    value.length > 0 &&
    defaultLanguage &&
    isBcp47(defaultLanguage)
  ) {
    return { default: defaultLanguage, values: { [defaultLanguage]: value } };
  }
  if (
    !isRecord(value) ||
    typeof value.default !== 'string' ||
    !isBcp47(value.default) ||
    !isRecord(value.values)
  ) {
    return undefined;
  }
  const values: Record<string, string> = {};
  for (const [language, text] of Object.entries(value.values)) {
    if (!isBcp47(language) || typeof text !== 'string' || text.length === 0) {
      return undefined;
    }
    values[language] = text;
  }
  if (!(value.default in values)) {
    return undefined;
  }
  const directions = isRecord(value.directions)
    ? (Object.fromEntries(
        Object.entries(value.directions).filter(
          ([language, direction]) =>
            isBcp47(language) &&
            (direction === 'ltr' || direction === 'rtl' || direction === 'auto'),
        ),
      ) as Record<string, TextDirection>)
    : undefined;
  return directions && Object.keys(directions).length > 0
    ? { default: value.default, values, directions }
    : { default: value.default, values };
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
