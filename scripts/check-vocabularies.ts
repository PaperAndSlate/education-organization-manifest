import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { validateDocument } from '@paperandslate/eom-validator';
import { isJsonObject, parseStrictJson, stringifyCanonical } from '@paperandslate/eom-core';

const root = resolve(process.cwd());
const directory = join(root, 'vocabularies', '1.0');
const failures: string[] = [];
const vocabularyBase = 'https://paperandslate.org/vocabularies/eom/';
const schemaUri = 'https://paperandslate.org/schemas/eom/1.0/vocabulary.schema.json';
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
if (!registryResult.valid)
  failures.push(`registry.json: ${JSON.stringify(registryResult.findings)}`);

const registryCategories = new Set<string>();
const registryByCategory = new Map<string, Record<string, unknown>>();
const registryUris = new Set<string>();
if (isJsonObject(registry) && Array.isArray(registry.vocabularies)) {
  for (const entry of registry.vocabularies) {
    if (isJsonObject(entry) && typeof entry.category === 'string') {
      registryCategories.add(entry.category);
      registryByCategory.set(entry.category, entry);
      if (typeof entry.vocabularyUri === 'string') {
        if (registryUris.has(entry.vocabularyUri))
          failures.push(`registry.json: vocabularyUri must be unique (${entry.vocabularyUri})`);
        registryUris.add(entry.vocabularyUri);
      }
      if (entry.currentVersion !== '1.0')
        failures.push(`${entry.category}: currentVersion must be 1.0`);
      if (
        !Array.isArray(entry.compatibleProtocolVersions) ||
        !entry.compatibleProtocolVersions.includes('1.0')
      ) {
        failures.push(`${entry.category}: compatibleProtocolVersions must include 1.0`);
      }
      if (entry.schema !== schemaUri)
        failures.push(
          `${entry.category}: registry schema URI is not the versioned vocabulary schema`,
        );
      if (entry.vocabularyUri !== `${vocabularyBase}${entry.category}`)
        failures.push(
          `${entry.category}: vocabularyUri must use the stable category URI convention`,
        );
      if (entry.snapshot !== `${vocabularyBase}1.0/${entry.category}.json`)
        failures.push(`${entry.category}: snapshot URI must match the versioned snapshot path`);
      if (!Array.isArray(entry.mappings) || entry.mappings.length === 0)
        failures.push(`${entry.category}: registry mappings must not be empty`);
    }
  }
}
if (
  !isJsonObject(registry) ||
  !Array.isArray(registry.vocabularies) ||
  registry.vocabularies.length !== expectedCategories.length
) {
  failures.push(`registry.json: expected ${expectedCategories.length} vocabulary records`);
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
let localizedTermCount = 0;
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
    const registryEntry = registryByCategory.get(category);
    if (!registryEntry) {
      failures.push(`${file}: category is not present in vocabularies/registry.json`);
    } else {
      if (value.version !== registryEntry.currentVersion)
        failures.push(`${file}: snapshot version does not match its registry record`);
      if (value.openness !== registryEntry.openness)
        failures.push(`${file}: openness does not match its registry record`);
      if (value.canonical !== `${vocabularyBase}${category}/1.0`)
        failures.push(`${file}: canonical URI must match the versioned category URI`);
      if (value.id !== value.canonical) failures.push(`${file}: id must equal canonical`);
      if (value.source !== registryEntry.vocabularyUri)
        failures.push(`${file}: source must point at the registered vocabulary URI`);
      if (
        !Array.isArray(value.compatibleProtocolVersions) ||
        !value.compatibleProtocolVersions.includes('1.0')
      ) {
        failures.push(`${file}: compatibleProtocolVersions must include 1.0`);
      }
    }
    if (!Array.isArray(value.terms) || value.terms.length === 0)
      failures.push(`${file}: vocabulary snapshots must contain terms`);
    else {
      const termUris = new Set<string>();
      const termCodes = new Set<string>();
      for (const term of value.terms) {
        if (!isJsonObject(term)) continue;
        if (isJsonObject(term.preferredLabel)) localizedTermCount += 1;
        if (typeof term.uri === 'string') {
          if (termUris.has(term.uri)) failures.push(`${file}: term URI values must be unique`);
          termUris.add(term.uri);
          if (!term.uri.startsWith(`${vocabularyBase}${category}/`))
            failures.push(`${file}: term URI must be within its vocabulary namespace`);
        }
        if (typeof term.code === 'string') {
          if (termCodes.has(term.code)) failures.push(`${file}: term code values must be unique`);
          termCodes.add(term.code);
        }
        if (Array.isArray(term.mappings)) {
          for (const mapping of term.mappings) {
            if (!isJsonObject(mapping) || typeof mapping.confidence !== 'string')
              failures.push(`${file}: every term mapping must record confidence`);
          }
        }
      }
    }
    const { contentDigest: _contentDigest, ...withoutDigest } = value;
    const expected = `sha256:${createHash('sha256').update(stringifyCanonical(withoutDigest), 'utf8').digest('hex')}`;
    if (value.contentDigest !== expected)
      failures.push(`${file}: contentDigest does not match canonical snapshot content`);
    const expectedFile = `${category}.json`;
    if (file !== expectedFile)
      failures.push(`${file}: category must be represented by ${expectedFile}`);
  } catch (error) {
    failures.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
if (localizedTermCount === 0)
  failures.push(
    'snapshots: at least one term must demonstrate a multilingual localized label record',
  );
for (const category of expectedCategories) {
  if (!seenCategories.has(category)) failures.push(`snapshot: missing ${category}`);
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `vocabulary check passed: ${expectedCategories.length} versioned categories and ${snapshotFiles.length} snapshots\n`,
  );
}
