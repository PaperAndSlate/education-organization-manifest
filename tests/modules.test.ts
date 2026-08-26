import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isJsonObject, parseStrictJson } from '@paperandslate/eom-core';
import { schemaFileForType } from '@paperandslate/eom-schema';
import { validateDocument } from '@paperandslate/eom-validator';

const moduleTypes = [
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
] as const;

const fixtureValue = parseStrictJson(
  readFileSync(resolve('fixtures/valid/modules/catalog-fixtures.json'), 'utf8'),
);

describe('EOM module registry and envelopes', () => {
  it('registers all 22 public module families', () => {
    const registry = parseStrictJson(readFileSync(resolve('modules/registry.json'), 'utf8'));
    expect(isJsonObject(registry)).toBe(true);
    if (!isJsonObject(registry)) return;
    expect(Array.isArray(registry.modules) ? registry.modules : []).toHaveLength(22);
    expect(moduleTypes.every((type) => schemaFileForType(type) !== undefined)).toBe(true);
  });

  it.each(moduleTypes)('validates the %s module fixture', (type) => {
    expect(isJsonObject(fixtureValue)).toBe(true);
    if (!isJsonObject(fixtureValue)) return;
    const document = fixtureValue[type];
    const result = validateDocument(document, { now: new Date('2026-01-01T00:00:00Z') });
    expect(result.valid, `${type}: ${JSON.stringify(result.findings)}`).toBe(true);
  });

  it('keeps module resource envelopes closed to unknown top-level fields', () => {
    expect(isJsonObject(fixtureValue)).toBe(true);
    if (!isJsonObject(fixtureValue)) return;
    const original = fixtureValue['campus-catalog'];
    expect(isJsonObject(original)).toBe(true);
    if (!isJsonObject(original)) return;
    const invalid = { ...original, privateEndpoint: 'https://internal.example/api' };
    const result = validateDocument(invalid);
    expect(result.structuralValid).toBe(false);
  });

  it('keeps the Ecme public tree addressable and validatable', () => {
    const rootPath = resolve(
      'examples/ecme-high/public/.well-known/educational-organization-manifest',
    );
    expect(existsSync(rootPath)).toBe(true);
    const rootResult = validateDocument(parseStrictJson(readFileSync(rootPath, 'utf8'), rootPath), {
      now: new Date('2026-01-01T00:00:00Z'),
    });
    expect(rootResult.valid, JSON.stringify(rootResult.findings)).toBe(true);

    const names = [
      'campuses',
      'departments',
      'staff',
      'courses',
      'offerings',
      'programs',
      'calendar',
      'events',
      'facilities',
      'services',
      'policies',
      'admissions',
      'sports',
      'transportation',
      'meals',
      'clubs',
      'jobs',
      'news',
      'statistics',
      'apis',
    ];
    for (const name of names) {
      const path = resolve(`examples/ecme-high/public/eom/${name}.json`);
      expect(existsSync(path), name).toBe(true);
      const result = validateDocument(parseStrictJson(readFileSync(path, 'utf8'), path), {
        now: new Date('2026-01-01T00:00:00Z'),
      });
      expect(result.valid, `${name}: ${JSON.stringify(result.findings)}`).toBe(true);
    }
    const courseCatalog = parseStrictJson(
      readFileSync(resolve('examples/ecme-high/public/eom/courses.json'), 'utf8'),
    );
    expect(isJsonObject(courseCatalog)).toBe(true);
    if (isJsonObject(courseCatalog) && Array.isArray(courseCatalog.items)) {
      expect(courseCatalog.items).toHaveLength(57);
      expect(courseCatalog.catalogVersion).toMatchObject({ status: 'active' });
      const culinary = courseCatalog.items.find(
        (item) => isJsonObject(item) && item.code === 'CUL-202',
      );
      expect(isJsonObject(culinary) && culinary.prerequisites).toBeTruthy();
    }
  });
});
