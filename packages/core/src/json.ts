export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export class StrictJsonError extends Error {
  public readonly code = 'EOM_JSON_DUPLICATE_KEY';

  public constructor(
    message: string,
    public readonly source?: string,
  ) {
    super(message);
    this.name = 'StrictJsonError';
  }
}

class DuplicateKeyScanner {
  private index = 0;

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
    this.index += 1;
    this.skipWhitespace();
    const keys = new Set<string>();
    if (this.text[this.index] === '}') {
      this.index += 1;
      return;
    }
    while (this.index < this.text.length) {
      this.skipWhitespace();
      const start = this.index;
      const raw = this.string();
      const key = JSON.parse(this.text.slice(start, this.index)) as string;
      if (keys.has(key)) {
        throw new StrictJsonError(`Duplicate JSON object key ${JSON.stringify(key)}.`, this.source);
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
  }

  private array(): void {
    this.index += 1;
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'invalid JSON';
    throw new StrictJsonError(`Invalid JSON${source ? ` in ${source}` : ''}: ${detail}`, source);
  }
  new DuplicateKeyScanner(text, source).scan();
  return parsed as JsonValue;
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
  for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
    const child = value[key];
    if (child !== undefined) {
      sorted[key] = stableJsonValue(child);
    }
  }
  return sorted;
}

export function stringifyCanonical(value: JsonValue): string {
  return `${JSON.stringify(stableJsonValue(value), null, 2)}\n`;
}
