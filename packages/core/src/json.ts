export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type StrictJsonErrorCode =
  | 'EOM_JSON_DUPLICATE_KEY'
  | 'EOM_JSON_PARSE'
  | 'EOM_JSON_UNICODE'
  | 'EOM_JSON_NONFINITE_NUMBER'
  | 'EOM_JSON_UNSUPPORTED_VALUE'
  | 'EOM_JSON_INPUT_TOO_LARGE'
  | 'EOM_JSON_DEPTH'
  | 'EOM_JSON_CYCLE';

export const MAX_STRICT_JSON_BYTES = 32 * 1024 * 1024;
export const MAX_STRICT_JSON_DEPTH = 128;
/** Maximum number of runtime JSON values canonicalization will traverse. */
export const MAX_STABLE_JSON_NODES = 100_000;

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
  private nodes = 0;

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
    this.nodes += 1;
    if (this.nodes > MAX_STABLE_JSON_NODES) {
      throw new StrictJsonError(
        `JSON value exceeds the ${MAX_STABLE_JSON_NODES}-node safety limit.`,
        this.source,
        'EOM_JSON_INPUT_TOO_LARGE',
      );
    }
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
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new StrictJsonError(
      'JSON contains a non-finite number.',
      source,
      'EOM_JSON_NONFINITE_NUMBER',
    );
  }
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
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

interface StableJsonState {
  readonly ancestors: WeakSet<object>;
  nodes: number;
}

export function stableJsonValue(value: JsonValue): JsonValue {
  return stableJsonValueInternal(value, { ancestors: new WeakSet<object>(), nodes: 0 }, 0);
}

function stableJsonValueInternal(value: unknown, state: StableJsonState, depth: number): JsonValue {
  state.nodes += 1;
  if (state.nodes > MAX_STABLE_JSON_NODES) {
    throw new StrictJsonError(
      `JSON value exceeds the ${MAX_STABLE_JSON_NODES}-node safety limit.`,
      undefined,
      'EOM_JSON_INPUT_TOO_LARGE',
    );
  }
  const candidate = value;
  if (
    candidate === undefined ||
    typeof candidate === 'function' ||
    typeof candidate === 'symbol' ||
    typeof candidate === 'bigint'
  ) {
    throw new StrictJsonError(
      'JSON contains a value that cannot be represented in strict JSON.',
      undefined,
      'EOM_JSON_UNSUPPORTED_VALUE',
    );
  }
  if (typeof candidate === 'number' && !Number.isFinite(candidate)) {
    throw new StrictJsonError(
      'JSON contains a non-finite number.',
      undefined,
      'EOM_JSON_NONFINITE_NUMBER',
    );
  }
  if (typeof candidate === 'string') {
    assertWellFormedUnicode(candidate);
    return candidate;
  }
  if (Array.isArray(candidate)) {
    return withStableContainer(candidate, state, depth, () => {
      const dense: JsonValue[] = [];
      for (let index = 0; index < candidate.length; index += 1) {
        if (!Object.hasOwn(candidate, index)) {
          throw new StrictJsonError(
            'JSON contains a sparse array with a missing element.',
            undefined,
            'EOM_JSON_UNSUPPORTED_VALUE',
          );
        }
        dense.push(stableJsonValueInternal(candidate[index], state, depth + 1));
      }
      return dense;
    });
  }
  if (candidate === null || typeof candidate === 'boolean' || typeof candidate === 'number') {
    return candidate;
  }
  if (!isJsonObject(candidate)) {
    throw new StrictJsonError(
      'JSON contains a non-plain object that cannot be represented in strict JSON.',
      undefined,
      'EOM_JSON_UNSUPPORTED_VALUE',
    );
  }
  return withStableContainer(candidate, state, depth, () => {
    // Define properties explicitly so JSON data keys such as "__proto__" remain
    // data properties instead of invoking Object.prototype's legacy setter.
    const sorted: JsonObject = {};
    for (const key of Object.keys(candidate).sort(compareJsonKeys)) {
      assertWellFormedUnicode(key);
      const child = candidate[key];
      if (child === undefined) {
        throw new StrictJsonError(
          'JSON contains an undefined object property.',
          undefined,
          'EOM_JSON_UNSUPPORTED_VALUE',
        );
      }
      Object.defineProperty(sorted, key, {
        configurable: true,
        enumerable: true,
        value: stableJsonValueInternal(child, state, depth + 1),
        writable: true,
      });
    }
    return sorted;
  });
}

function withStableContainer<T extends JsonValue>(
  value: object,
  state: StableJsonState,
  depth: number,
  callback: () => T,
): T {
  if (depth + 1 > MAX_STRICT_JSON_DEPTH) {
    throw new StrictJsonError(
      `JSON nesting exceeds the ${MAX_STRICT_JSON_DEPTH}-level safety limit.`,
      undefined,
      'EOM_JSON_DEPTH',
    );
  }
  if (state.ancestors.has(value)) {
    throw new StrictJsonError('JSON contains a cyclic runtime value.', undefined, 'EOM_JSON_CYCLE');
  }
  state.ancestors.add(value);
  try {
    return callback();
  } finally {
    state.ancestors.delete(value);
  }
}

/** Compare JSON object keys by UTF-16 code units, independent of host locale. */
function compareJsonKeys(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function stringifyCanonical(value: JsonValue): string {
  const serialized = JSON.stringify(stableJsonValue(value), null, 2);
  if (new TextEncoder().encode(serialized).byteLength > MAX_STRICT_JSON_BYTES) {
    throw new StrictJsonError(
      `JSON output exceeds the ${MAX_STRICT_JSON_BYTES}-byte safety limit.`,
      undefined,
      'EOM_JSON_INPUT_TOO_LARGE',
    );
  }
  return `${serialized}\n`;
}
