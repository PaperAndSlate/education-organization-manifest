import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { validateDocument } from '@paperandslate/eom-validator';
import { isJsonObject, parseStrictJson, stringifyCanonical, type JsonObject } from '@paperandslate/eom-core';

const root = resolve(process.cwd());
const directory = join(root, 'vocabularies', '1.0');
const failures: string[] = [];
const expectedCategories = [
  'organization-types',
  'education-levels',
  'course-subjects',
  'credit-systems',
  'academic-period-types',
  'delivery-modes',
  'facility-types',
  'service-types',
  'sports',
  'club-categories',
  'meal-types',
  'transport-modes',
  'contact-roles',
  'document-categories',
  'statistics-metrics',
  'source-types',
  'verification-statuses',
  'lifecycle-statuses',
  'identifier-schemes',
] as const;

const registryPath = join(root, 'vocabularies', 'registry.json');
const registry = parseStrictJson(await readFile(registryPath, 'utf8'), registryPath);
const registryResult = validateDocument(registry, { now: new Date('2026-08-26T00:00:00Z') });
if (!registryResult.valid) failures.push(`registry.json: ${JSON.stringify(registryResult.findings)}`);

const registryCategories = new Set<string>();
if (isJsonObject(registry) && Array.isArray(registry.vocabularies)) {
  for (const entry of registry.vocabularies) {
    if (isJsonObject(entry) && typeof entry.category === 'string') registryCategories.add(entry.category);
  }
}
for (const category of expectedCategories) {
  if (!registryCategories.has(category)) failures.push(`registry.json: missing ${category}`);
}
for (const category of registryCategories) {
  if (!(expectedCategories as readonly string[]).includes(category)) {
    failures.push(`registry.json: unexpected category ${category}`);
  }
}

const snapshotFiles = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
const seenCategories = new Set<string>();
for (const file of snapshotFiles) {
  if (file === 'registry.json') continue;
  const path = join(directory, file);
  try {
    const value = parseStrictJson(await readFile(path, 'utf8'), path);
    const result = validateDocument(value, { now: new Date('2026-08-26T00:00:00Z') });
    if (!result.valid) failures.push(`${file}: ${JSON.stringify(result.findings)}`);
    if (!isJsonObject(value)) continue;
    const category = value.category;
    if (typeof category !== 'string') continue;
    seenCategories.add(category);
    const { contentDigest: _contentDigest, ...withoutDigest } = value;
    const expected = `sha256:${createHash('sha256').update(stringifyCanonical(withoutDigest), 'utf8').digest('hex')}`;
    if (value.contentDigest !== expected) failures.push(`${file}: contentDigest does not match canonical snapshot content`);
    const expectedFile = `${category}.json`;
    if (file !== expectedFile) failures.push(`${file}: category must be represented by ${expectedFile}`);
  } catch (error) {
    failures.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
for (const category of expectedCategories) {
  if (!seenCategories.has(category)) failures.push(`snapshot: missing ${category}`);
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`vocabulary check passed: ${expectedCategories.length} versioned categories and ${snapshotFiles.length - 1} snapshots\n`);
}
