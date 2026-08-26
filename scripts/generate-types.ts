import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Schema = {
  readonly $id?: unknown;
  readonly $defs?: Record<string, Schema>;
  readonly $ref?: unknown;
  readonly type?: unknown;
  readonly const?: unknown;
  readonly enum?: readonly unknown[];
  readonly oneOf?: readonly Schema[];
  readonly anyOf?: readonly Schema[];
  readonly items?: Schema;
  readonly properties?: Record<string, Schema>;
  readonly required?: readonly string[];
  readonly additionalProperties?: unknown;
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaDirectory = join(root, 'schemas', '1.0');
const outputPath = join(root, 'packages', 'types', 'src', 'generated.ts');
const schemaFiles = [
  'common.schema.json',
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

const loaded = new Map<string, Schema>();

function pascal(value: string): string {
  return value
    .replace(/\.schema\.json$/u, '')
    .split(/[^A-Za-z0-9]+/u)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join('');
}

function schemaName(file: string): string {
  return pascal(file);
}

function definitionName(file: string, name: string): string {
  return `${schemaName(file)}${pascal(name)}`;
}

function quote(value: unknown): string {
  return JSON.stringify(value);
}

function refType(ref: string, currentFile: string): string {
  const [filePart, fragment] = ref.split('#', 2);
  const referencedFile = filePart ? basename(filePart) : currentFile;
  if (fragment?.startsWith('/$defs/')) {
    return definitionName(referencedFile, fragment.slice('/$defs/'.length));
  }
  return schemaName(referencedFile);
}

function schemaType(schema: Schema, currentFile: string, propertyName?: string): string {
  if (typeof schema.$ref === 'string') {
    return refType(schema.$ref, currentFile);
  }
  if ('const' in schema) {
    return quote(schema.const);
  }
  if (Array.isArray(schema.enum)) {
    return schema.enum.map(quote).join(' | ') || 'never';
  }
  if (Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf)) {
    const alternatives = schema.oneOf ?? schema.anyOf ?? [];
    return (
      alternatives.map((item) => schemaType(item, currentFile, propertyName)).join(' | ') || 'never'
    );
  }
  if (Array.isArray(schema.type)) {
    return schema.type
      .map((kind) => schemaType({ ...schema, type: kind }, currentFile, propertyName))
      .join(' | ');
  }
  if (schema.type === 'array') {
    const itemType = schema.items ? schemaType(schema.items, currentFile) : 'JsonValue';
    return `ReadonlyArray<${itemType}>`;
  }
  if (schema.type === 'object' || schema.properties) {
    if (!schema.properties || Object.keys(schema.properties).length === 0) {
      return schema.additionalProperties === false
        ? 'Readonly<Record<string, never>>'
        : 'Readonly<Record<string, JsonValue>>';
    }
    const required = new Set(schema.required ?? []);
    const fields = Object.entries(schema.properties)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([name, child]) =>
          `  readonly ${JSON.stringify(name)}${required.has(name) ? '' : '?'}: ${schemaType(child, currentFile, name)};`,
      )
      .join('\n');
    return `Readonly<{\n${fields}\n}>`;
  }
  if (schema.type === 'string') return 'string';
  if (schema.type === 'number' || schema.type === 'integer') return 'number';
  if (schema.type === 'boolean') return 'boolean';
  if (schema.type === 'null') return 'null';
  return 'JsonValue';
}

function renderNamedInterface(name: string, schema: Schema, file: string): string {
  const type = schemaType(schema, file);
  if (!type.startsWith('Readonly<{')) {
    return `export type ${name} = ${type};`;
  }
  return `export type ${name} = ${type};`;
}

export async function generateTypesSource(): Promise<string> {
  for (const file of schemaFiles) {
    const raw = await readFile(join(schemaDirectory, file), 'utf8');
    loaded.set(file, JSON.parse(raw) as Schema);
  }
  const lines: string[] = [
    '// @generated by scripts/generate-types.ts; do not edit directly.',
    '// SPDX-License-Identifier: Apache-2.0',
    '',
    'export type JsonPrimitive = string | number | boolean | null;',
    'export type JsonValue = JsonPrimitive | Readonly<{ [key: string]: JsonValue }> | ReadonlyArray<JsonValue>;',
    '',
  ];
  for (const [file, schema] of loaded) {
    for (const [name, definition] of Object.entries(schema.$defs ?? {}).sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      lines.push(renderNamedInterface(definitionName(file, name), definition, file), '');
    }
    lines.push(renderNamedInterface(schemaName(file), schema, file), '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

async function main(): Promise<void> {
  const generated = await generateTypesSource();
  if (process.argv.includes('--check')) {
    let existing: string;
    try {
      existing = await readFile(outputPath, 'utf8');
    } catch {
      throw new Error(`Generated types are missing at ${outputPath}. Run pnpm generate:types.`);
    }
    if (existing !== generated) {
      throw new Error(`Generated types are stale at ${outputPath}. Run pnpm generate:types.`);
    }
    process.stdout.write(`generated types are current: ${outputPath}\n`);
    return;
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, generated, 'utf8');
  process.stdout.write(`generated ${outputPath}\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
