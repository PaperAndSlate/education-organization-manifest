import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isJsonObject, parseStrictJson, type JsonObject } from '@paperandslate/eom-core';

export const SCHEMA_BASE_URI = 'https://paperandslate.org/schemas/eom/1.0/';

export const SCHEMA_FILES = [
  'common.schema.json',
  'config.schema.json',
  'manifest.schema.json',
  'resource.schema.json',
  'capability.schema.json',
  'delegation.schema.json',
  'provenance.schema.json',
  'source.schema.json',
  'evidence.schema.json',
  'conflict.schema.json',
  'review.schema.json',
  'candidate.schema.json',
  'signature.schema.json',
  'mapping.schema.json',
  'organization-profile.schema.json',
  'organization-index.schema.json',
  'resource-index.schema.json',
  'contact-directory.schema.json',
  'key-set.schema.json',
  'conformance-report.schema.json',
  'module-resource.schema.json',
  'module-items.schema.json',
  'modules/campus-catalog.schema.json',
  'modules/department-catalog.schema.json',
  'modules/staff-directory.schema.json',
  'modules/course-catalog.schema.json',
  'modules/course-offering-catalog.schema.json',
  'modules/program-catalog.schema.json',
  'modules/academic-calendar.schema.json',
  'modules/event-catalog.schema.json',
  'modules/facility-catalog.schema.json',
  'modules/service-catalog.schema.json',
  'modules/policy-catalog.schema.json',
  'modules/admissions-profile.schema.json',
  'modules/sports-catalog.schema.json',
  'modules/transportation-catalog.schema.json',
  'modules/meal-menu-catalog.schema.json',
  'modules/club-catalog.schema.json',
  'modules/job-catalog.schema.json',
  'modules/news-feed.schema.json',
  'modules/statistics-profile.schema.json',
  'modules/api-reference.schema.json',
] as const;

export type SchemaFile = (typeof SCHEMA_FILES)[number];

const schemaDirectory = join(dirname(fileURLToPath(import.meta.url)), '../../../schemas/1.0');

export function schemaPath(file: SchemaFile): string {
  return join(schemaDirectory, file);
}

export function readSchema(file: SchemaFile): JsonObject {
  const value = parseStrictJson(readFileSync(schemaPath(file), 'utf8'), schemaPath(file));
  if (!isJsonObject(value)) {
    throw new Error(`Schema ${file} must be a JSON object.`);
  }
  return value;
}

export function readAllSchemas(): readonly JsonObject[] {
  return SCHEMA_FILES.map(readSchema);
}

export function schemaFileForType(type: string): SchemaFile | undefined {
  const coreTypes: Record<string, SchemaFile> = {
    manifest: 'manifest.schema.json',
    resource: 'resource.schema.json',
    capability: 'capability.schema.json',
    delegation: 'delegation.schema.json',
    provenance: 'provenance.schema.json',
    'source-record': 'source.schema.json',
    'claim-record': 'evidence.schema.json',
    'conflict-record': 'conflict.schema.json',
    'review-decision': 'review.schema.json',
    'candidate-workspace': 'candidate.schema.json',
    signature: 'signature.schema.json',
    'mapping-registry': 'mapping.schema.json',
    'organization-profile': 'organization-profile.schema.json',
    'organization-index': 'organization-index.schema.json',
    'resource-index': 'resource-index.schema.json',
    'contact-directory': 'contact-directory.schema.json',
    'key-set': 'key-set.schema.json',
    'conformance-report': 'conformance-report.schema.json',
  };
  if (coreTypes[type]) return coreTypes[type];
  const moduleFile = `modules/${type}.schema.json` as SchemaFile;
  return SCHEMA_FILES.includes(moduleFile) ? moduleFile : undefined;
}

export function availableSchemaFiles(): readonly string[] {
  const rootFiles = readdirSync(schemaDirectory, { withFileTypes: true });
  const files = rootFiles
    .filter((entry) => entry.isFile() && entry.name.endsWith('.schema.json'))
    .map((entry) => entry.name);
  const moduleFiles = readdirSync(join(schemaDirectory, 'modules'))
    .filter((file) => file.endsWith('.schema.json'))
    .map((file) => `modules/${file}`);
  return [...files, ...moduleFiles].sort();
}
