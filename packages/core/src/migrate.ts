import { isJsonObject, type JsonObject, type JsonValue } from './json.js';

export interface MigrationResult {
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly changed: boolean;
  readonly document: JsonObject;
  readonly notes: readonly string[];
}

export class MigrationError extends Error {
  public constructor(
    message: string,
    public readonly code: 'EOM_MIGRATION_UNSUPPORTED' | 'EOM_MIGRATION_OBJECT_REQUIRED',
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

/** Apply only explicitly supported, deterministic document migrations. */
export function migrateDocument(
  value: unknown,
  fromVersion: string,
  toVersion = '1.0',
): MigrationResult {
  if (!isJsonObject(value)) {
    throw new MigrationError(
      'Only JSON object documents can be migrated.',
      'EOM_MIGRATION_OBJECT_REQUIRED',
    );
  }
  if (fromVersion === toVersion) {
    return {
      fromVersion,
      toVersion,
      changed: false,
      document: cloneObject(value),
      notes: ['The document already uses the requested EOM version.'],
    };
  }
  if (fromVersion !== '0.9' || toVersion !== '1.0') {
    throw new MigrationError(
      `No migration is registered from EOM ${fromVersion} to EOM ${toVersion}.`,
      'EOM_MIGRATION_UNSUPPORTED',
    );
  }
  const document = cloneObject(value);
  const notes: string[] = [];
  const type = stringValue(document.type) ?? stringValue(document.kind);
  if (!document.type && type) {
    document.type = type;
    notes.push('Renamed legacy kind to type.');
  }
  if (!document.id && typeof document.uri === 'string') {
    document.id = document.uri;
    notes.push('Promoted legacy uri to the stable id field.');
  }
  if (!document.canonical && typeof document.canonicalUrl === 'string') {
    document.canonical = document.canonicalUrl;
    notes.push('Renamed canonicalUrl to canonical.');
  }
  if (!document.name && document.title !== undefined) {
    document.name = document.title;
    notes.push('Copied legacy title to name where name was absent.');
  }
  if (!document.defaultLanguage && typeof document.language === 'string') {
    document.defaultLanguage = document.language;
    notes.push('Renamed language to defaultLanguage.');
  }
  if (!document.items && Array.isArray(document.data)) {
    document.items = document.data;
    notes.push('Renamed legacy data collection to items.');
  }
  if (type) {
    document.$schema = schemaForType(type);
    document.specification = 'https://paperandslate.org/spec/eom/1.0';
    document.version = '1.0';
    notes.push('Added the EOM 1.0 specification, version, and schema links.');
  }
  delete document.kind;
  delete document.uri;
  delete document.canonicalUrl;
  delete document.language;
  delete document.data;
  return { fromVersion, toVersion, changed: true, document, notes };
}

function schemaForType(type: string): string {
  const modules = new Set([
    'campus-catalog',
    'department-catalog',
    'staff-directory',
    'course-catalog',
    'course-offering-catalog',
    'program-catalog',
    'academic-calendar',
    'event-catalog',
    'facility-catalog',
    'service-catalog',
    'policy-catalog',
    'admissions-profile',
    'sports-catalog',
    'transportation-catalog',
    'meal-menu-catalog',
    'club-catalog',
    'job-catalog',
    'news-feed',
    'statistics-profile',
    'api-reference',
  ]);
  const file = modules.has(type) ? `modules/${type}.schema.json` : `${type}.schema.json`;
  return `https://paperandslate.org/schemas/eom/1.0/${file}`;
}

function cloneObject(value: JsonObject): JsonObject {
  const result: JsonObject = Object.create(null) as JsonObject;
  for (const [key, child] of Object.entries(value)) result[key] = cloneValue(child);
  return result;
}

function cloneValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (isJsonObject(value)) return cloneObject(value);
  return value;
}

function stringValue(value: JsonValue | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
