export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type StrictJsonErrorCode =
  | 'EOM_JSON_DUPLICATE_KEY'
  | 'EOM_JSON_PARSE'
  | 'EOM_JSON_UNICODE'
  | 'EOM_JSON_INPUT_TOO_LARGE'
  | 'EOM_JSON_DEPTH';

export const MAX_STRICT_JSON_BYTES = 32 * 1024 * 1024;
export const MAX_STRICT_JSON_DEPTH = 128;

export class StrictJsonError extends Error {
  public constructor(
    message: string,
    public readonly source?: string,
    public readonly code: StrictJsonErrorCode = 'EOM_JSON_PARSE',
  ) {
    super(message);
    this.name = 'StrictJsonError';
  }
}

class DuplicateKeyScanner {
  private index = 0;
  private depth = 0;

  public constructor(
    private readonly text: string,
    private readonly source?: string,
  ) {}

  public scan(): void {
    this.skipWhitespace();
    this.value();
    this.skipWhitespace();
    if (this.index !== this.text.length) {
      throw new StrictJsonError(`Unexpected JSON data at offset ${this.index}.`, this.source);
    }
  }

  private value(): void {
    this.skipWhitespace();
    const character = this.text[this.index];
    if (character === '{') {
      this.object();
      return;
    }
    if (character === '[') {
      this.array();
      return;
    }
    if (character === '"') {
      this.string();
      return;
    }
    this.primitive();
  }

  private object(): void {
    this.enterContainer();
    this.index += 1;
    try {
      this.skipWhitespace();
      const keys = new Set<string>();
      if (this.text[this.index] === '}') {
        this.index += 1;
        return;
      }
      while (this.index < this.text.length) {
        this.skipWhitespace();
        const start = this.index;
        this.string();
        const key = JSON.parse(this.text.slice(start, this.index)) as string;
        if (keys.has(key)) {
          throw new StrictJsonError(
            `Duplicate JSON object key ${JSON.stringify(key)}.`,
            this.source,
            'EOM_JSON_DUPLICATE_KEY',
          );
        }
        keys.add(key);
        this.skipWhitespace();
        if (this.text[this.index] !== ':') {
          throw new StrictJsonError(
            `Expected ':' after JSON object key at offset ${this.index}.`,
            this.source,
          );
        }
        this.index += 1;
        this.value();
        this.skipWhitespace();
        const separator = this.text[this.index];
        if (separator === '}') {
          this.index += 1;
          return;
        }
        if (separator !== ',') {
          throw new StrictJsonError(`Expected ',' or '}' at offset ${this.index}.`, this.source);
        }
        this.index += 1;
        this.skipWhitespace();
        if (this.text[this.index] === '}') {
          throw new StrictJsonError(
            `Trailing comma in JSON object at offset ${this.index}.`,
            this.source,
          );
        }
      }
      throw new StrictJsonError('Unclosed JSON object.', this.source);
    } finally {
      this.leaveContainer();
    }
  }

  private array(): void {
    this.enterContainer();
    this.index += 1;
    try {
      this.skipWhitespace();
      if (this.text[this.index] === ']') {
        this.index += 1;
        return;
      }
      while (this.index < this.text.length) {
        this.value();
        this.skipWhitespace();
        const separator = this.text[this.index];
        if (separator === ']') {
          this.index += 1;
          return;
        }
        if (separator !== ',') {
          throw new StrictJsonError(`Expected ',' or ']' at offset ${this.index}.`, this.source);
        }
        this.index += 1;
        this.skipWhitespace();
        if (this.text[this.index] === ']') {
          throw new StrictJsonError(
            `Trailing comma in JSON array at offset ${this.index}.`,
            this.source,
          );
        }
      }
      throw new StrictJsonError('Unclosed JSON array.', this.source);
    } finally {
      this.leaveContainer();
    }
  }

  private enterContainer(): void {
    this.depth += 1;
    if (this.depth > MAX_STRICT_JSON_DEPTH) {
      throw new StrictJsonError(
        `JSON nesting exceeds the ${MAX_STRICT_JSON_DEPTH}-level safety limit.`,
        this.source,
        'EOM_JSON_DEPTH',
      );
    }
  }

  private leaveContainer(): void {
    this.depth -= 1;
  }

  private string(): string {
    const start = this.index;
    if (this.text[this.index] !== '"') {
      throw new StrictJsonError(`Expected JSON string at offset ${this.index}.`, this.source);
    }
    this.index += 1;
    while (this.index < this.text.length) {
      const character = this.text[this.index];
      if (character === '\\') {
        this.index += 2;
        continue;
      }
      this.index += 1;
      if (character === '"') {
        return this.text.slice(start, this.index);
      }
    }
    throw new StrictJsonError('Unclosed JSON string.', this.source);
  }

  private primitive(): void {
    const start = this.index;
    while (this.index < this.text.length && !/[\s,\]}]/u.test(this.text[this.index] ?? '')) {
      this.index += 1;
    }
    if (start === this.index) {
      throw new StrictJsonError(`Expected JSON value at offset ${this.index}.`, this.source);
    }
  }

  private skipWhitespace(): void {
    while (this.index < this.text.length && /\s/u.test(this.text[this.index] ?? '')) {
      this.index += 1;
    }
  }
}

export function parseStrictJson(text: string, source?: string): JsonValue {
  if (new TextEncoder().encode(text).byteLength > MAX_STRICT_JSON_BYTES) {
    throw new StrictJsonError(
      `JSON input exceeds the ${MAX_STRICT_JSON_BYTES}-byte safety limit.`,
      source,
      'EOM_JSON_INPUT_TOO_LARGE',
    );
  }
  // Scan before materializing the parsed value so excessive nesting is rejected before
  // JSON.parse or the Unicode walk can recurse through attacker-controlled data.
  try {
    new DuplicateKeyScanner(text, source).scan();
  } catch (error) {
    if (error instanceof StrictJsonError) throw error;
    const detail = error instanceof Error ? error.message : 'invalid JSON';
    throw new StrictJsonError(`Invalid JSON${source ? ` in ${source}` : ''}: ${detail}`, source);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'invalid JSON';
    throw new StrictJsonError(`Invalid JSON${source ? ` in ${source}` : ''}: ${detail}`, source);
  }
  assertWellFormedUnicode(parsed, source);
  return parsed as JsonValue;
}

function assertWellFormedUnicode(value: unknown, source?: string): void {
  if (typeof value === 'string') {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          index += 1;
          continue;
        }
        throw new StrictJsonError(
          `JSON contains an unpaired UTF-16 surrogate at string offset ${index}.`,
          source,
          'EOM_JSON_UNICODE',
        );
      }
      if (code >= 0xdc00 && code <= 0xdfff) {
        throw new StrictJsonError(
          `JSON contains an unpaired UTF-16 surrogate at string offset ${index}.`,
          source,
          'EOM_JSON_UNICODE',
        );
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertWellFormedUnicode(item, source);
    return;
  }
  if (isJsonObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      assertWellFormedUnicode(key, source);
      assertWellFormedUnicode(item, source);
    }
  }
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stableJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(stableJsonValue);
  }
  if (!isJsonObject(value)) {
    return value;
  }
  const sorted: JsonObject = {};
  for (const key of Object.keys(value).sort(compareJsonKeys)) {
    const child = value[key];
    if (child !== undefined) {
      sorted[key] = stableJsonValue(child);
    }
  }
  return sorted;
}

/** Compare JSON object keys by UTF-16 code units, independent of host locale. */
function compareJsonKeys(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function stringifyCanonical(value: JsonValue): string {
  return `${JSON.stringify(stableJsonValue(value), null, 2)}\n`;
}
