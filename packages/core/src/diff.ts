import { isJsonObject, stringifyCanonical, type JsonValue } from './json.js';

export type DiffChangeKind = 'added' | 'removed' | 'changed';

export interface SemanticDiffChange {
  readonly kind: DiffChangeKind;
  readonly path: string;
  readonly before?: JsonValue;
  readonly after?: JsonValue;
  readonly breaking: boolean;
  readonly reason?: string;
}

export interface SemanticDiffResult {
  readonly fromType?: string;
  readonly toType?: string;
  readonly changes: readonly SemanticDiffChange[];
  readonly breaking: boolean;
  readonly compatible: boolean;
}

/**
 * Compare two JSON resources using stable object paths and id-aware array
 * matching. The result is intentionally descriptive: consumers still decide
 * whether a change is acceptable for their profile and effective date.
 */
export function semanticDiff(before: unknown, after: unknown): SemanticDiffResult {
  const changes: SemanticDiffChange[] = [];
  compare(before, after, '', changes);
  const sorted = changes.sort((left, right) => compareStrings(left.path, right.path));
  return {
    ...(isJsonObject(before) && typeof before.type === 'string' ? { fromType: before.type } : {}),
    ...(isJsonObject(after) && typeof after.type === 'string' ? { toType: after.type } : {}),
    changes: sorted,
    breaking: sorted.some((change) => change.breaking),
    compatible: !sorted.some((change) => change.breaking),
  };
}

function compare(
  before: unknown,
  after: unknown,
  path: string,
  changes: SemanticDiffChange[],
): void {
  if (before === undefined && after !== undefined) {
    changes.push({ kind: 'added', path: path || '/', after: asJsonValue(after), breaking: false });
    return;
  }
  if (before !== undefined && after === undefined) {
    const field = lastPathSegment(path);
    changes.push({
      kind: 'removed',
      path: path || '/',
      before: asJsonValue(before),
      breaking: isBreakingRemoval(field),
      ...(isBreakingRemoval(field)
        ? { reason: `Removing ${field || 'the value'} may break consumers.` }
        : {}),
    });
    return;
  }
  if (isJsonObject(before) && isJsonObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort(compareStrings)) {
      compare(before[key], after[key], `${path}/${escapePointer(key)}`, changes);
    }
    return;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    compareArrays(before, after, path, changes);
    return;
  }
  if (!sameJson(before, after)) {
    const field = lastPathSegment(path);
    const breaking = isBreakingChange(field, before, after);
    changes.push({
      kind: 'changed',
      path: path || '/',
      before: asJsonValue(before),
      after: asJsonValue(after),
      breaking,
      ...(breaking
        ? { reason: `Changing ${field || 'the value'} can invalidate existing consumers.` }
        : {}),
    });
  }
}

function compareArrays(
  before: readonly unknown[],
  after: readonly unknown[],
  path: string,
  changes: SemanticDiffChange[],
): void {
  const beforeItems = indexedById(before);
  const afterItems = indexedById(after);
  if (beforeItems && afterItems) {
    const ids = new Set([...beforeItems.keys(), ...afterItems.keys()]);
    for (const id of [...ids].sort(compareStrings)) {
      compare(beforeItems.get(id), afterItems.get(id), `${path}/@id/${escapePointer(id)}`, changes);
    }
    return;
  }
  const length = Math.max(before.length, after.length);
  for (let index = 0; index < length; index += 1) {
    compare(before[index], after[index], `${path}/${index}`, changes);
  }
}

function indexedById(value: readonly unknown[]): Map<string, unknown> | undefined {
  if (!value.every((item) => isJsonObject(item) && typeof item.id === 'string')) return undefined;
  const indexed = new Map<string, unknown>();
  for (const item of value) {
    if (!isJsonObject(item) || typeof item.id !== 'string' || indexed.has(item.id))
      return undefined;
    indexed.set(item.id, item);
  }
  return indexed;
}

function sameJson(left: unknown, right: unknown): boolean {
  try {
    return stringifyCanonical(left as JsonValue) === stringifyCanonical(right as JsonValue);
  } catch {
    return JSON.stringify(left) === JSON.stringify(right);
  }
}

function asJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(asJsonValue);
  if (isJsonObject(value)) {
    const result: Record<string, JsonValue> = {};
    for (const [key, child] of Object.entries(value)) result[key] = asJsonValue(child);
    return result;
  }
  return null;
}

function isBreakingRemoval(field: string): boolean {
  return field === 'id' || field === 'type' || field === 'canonical' || field === 'version';
}

function isBreakingChange(field: string, before: unknown, after: unknown): boolean {
  if (field === 'id' || field === 'type' || field === 'canonical' || field === 'version')
    return true;
  if (field === 'required' && before === true && after === false) return true;
  return false;
}

function lastPathSegment(path: string): string {
  const segment = path.split('/').at(-1) ?? '';
  return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
