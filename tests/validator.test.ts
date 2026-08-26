import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseStrictJson } from '@paperandslate/eom-core';
import { publicationSetFindings, validateDocument } from '@paperandslate/eom-validator';

const root = resolve(process.cwd());

function fixture(path: string): unknown {
  return parseStrictJson(readFileSync(resolve(root, path), 'utf8'), path);
}

describe('EOM structural and semantic validation', () => {
  it('accepts the minimal manifest fixture', () => {
    const result = validateDocument(fixture('fixtures/valid/core/minimal-school-manifest.json'), {
      now: new Date('2026-01-01T00:00:00Z'),
    });
    expect(result.valid).toBe(true);
    expect(result.structuralValid).toBe(true);
    expect(result.semanticValid).toBe(true);
    expect(result.findings.filter((item) => item.severity === 'error')).toHaveLength(0);
  });

  it('validates core resource documents by their type', () => {
    for (const path of [
      'fixtures/valid/core/minimal-school-organization.json',
      'fixtures/valid/core/minimal-school-contacts.json',
    ]) {
      const result = validateDocument(fixture(path), { now: new Date('2026-01-01T00:00:00Z') });
      expect(result.valid, path).toBe(true);
    }
  });

  it('rejects unknown top-level properties structurally', () => {
    const result = validateDocument(fixture('fixtures/invalid/schema/unknown-top-level.json'));
    expect(result.valid).toBe(false);
    expect(result.structuralValid).toBe(false);
    expect(result.findings.some((item) => item.code === 'EOM_SCHEMA_ADDITIONALPROPERTIES')).toBe(
      true,
    );
  });

  it('rejects relative identifiers structurally', () => {
    const result = validateDocument(fixture('fixtures/invalid/semantic/relative-id.json'));
    expect(result.valid).toBe(false);
    expect(result.findings.some((item) => item.pointer === '/id')).toBe(true);
  });

  it('reports cross-origin resources without delegation', () => {
    const manifest = fixture('fixtures/valid/core/minimal-school-manifest.json') as Record<
      string,
      unknown
    >;
    const resources = manifest.resources as Array<Record<string, unknown>>;
    resources[0] = { ...resources[0], href: 'https://vendor.example/organization.json' };
    const result = validateDocument(manifest, { now: new Date('2026-01-01T00:00:00Z') });
    expect(result.valid).toBe(false);
    expect(
      result.findings.some((item) => item.code === 'EOM_RESOURCE_CROSS_ORIGIN_UNAUTHORIZED'),
    ).toBe(true);
  });

  it('accepts a cross-origin resource only inside an active delegation scope', () => {
    const manifest = fixture('fixtures/valid/core/minimal-school-manifest.json') as Record<
      string,
      unknown
    >;
    const resources = manifest.resources as Array<Record<string, unknown>>;
    resources[0] = {
      ...resources[0],
      href: 'https://vendor.example/eom/organization.json',
    };
    manifest.delegations = [
      {
        id: 'https://ecme-high.example/id/delegation/vendor-organization',
        delegate: 'https://vendor.example',
        scope: {
          resourceTypes: ['organization-profile'],
          resourceIds: [resources[0].id],
          allowedOrigins: ['https://vendor.example'],
          allowedPathPrefixes: ['/eom/'],
        },
        validFrom: '2025-01-01T00:00:00Z',
        validUntil: '2027-01-01T00:00:00Z',
        transitive: false,
        status: 'active',
      },
    ];
    const result = validateDocument(manifest, { now: new Date('2026-01-01T00:00:00Z') });
    expect(result.valid, JSON.stringify(result.findings)).toBe(true);
  });

  it('rejects a delegated resource outside the allowed path prefix', () => {
    const manifest = fixture('fixtures/valid/core/minimal-school-manifest.json') as Record<
      string,
      unknown
    >;
    const resources = manifest.resources as Array<Record<string, unknown>>;
    resources[0] = {
      ...resources[0],
      href: 'https://vendor.example/private/organization.json',
    };
    manifest.delegations = [
      {
        id: 'https://ecme-high.example/id/delegation/vendor-organization',
        delegate: 'https://vendor.example',
        scope: {
          resourceTypes: ['organization-profile'],
          resourceIds: [resources[0].id],
          allowedOrigins: ['https://vendor.example'],
          allowedPathPrefixes: ['/eom/'],
        },
        validFrom: '2025-01-01T00:00:00Z',
        validUntil: '2027-01-01T00:00:00Z',
        transitive: false,
        status: 'active',
      },
    ];
    const result = validateDocument(manifest, { now: new Date('2026-01-01T00:00:00Z') });
    expect(result.valid).toBe(false);
    expect(
      result.findings.some((item) => item.code === 'EOM_RESOURCE_CROSS_ORIGIN_UNAUTHORIZED'),
    ).toBe(true);
  });

  it('rejects prerequisite cycles and preserves a stable finding code', () => {
    const result = validateDocument(fixture('fixtures/invalid/semantic/prerequisite-cycle.json'));
    expect(result.structuralValid).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.findings.some((item) => item.code === 'EOM_PREREQUISITE_CYCLE')).toBe(true);
  });

  it('accepts a historical catalog version with stable course identity', () => {
    const result = validateDocument(fixture('fixtures/valid/course/historical-catalog.json'));
    expect(result.valid, JSON.stringify(result.findings)).toBe(true);
  });

  it('resolves course, offering, and program references across a publication set', () => {
    const organization = {
      id: 'https://set.example/id/school',
      type: 'organization-profile',
    };
    const course = {
      id: 'https://set.example/id/course/one',
      type: 'course',
      name: 'Course One',
      provider: { id: organization.id },
    };
    const courseCatalog = {
      type: 'course-catalog',
      items: [course],
    };
    const offering = {
      id: 'https://set.example/id/offering/one',
      type: 'course-offering',
      name: 'Course One — Fall',
      course: { id: course.id },
      provider: { id: organization.id },
    };
    const program = {
      id: 'https://set.example/id/program/one',
      type: 'program',
      name: 'Program One',
      provider: { id: organization.id },
      requirements: [{ kind: 'all', courses: [{ id: course.id }] }],
    };
    const findings = publicationSetFindings({
      organization,
      'course-catalog': courseCatalog,
      'course-offering-catalog': { type: 'course-offering-catalog', items: [offering] },
      'program-catalog': { type: 'program-catalog', items: [program] },
    });
    expect(findings.filter((item) => item.severity === 'error')).toHaveLength(0);
  });
});
