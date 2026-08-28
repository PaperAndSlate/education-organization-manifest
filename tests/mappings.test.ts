import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  adapterDefinitions,
  eomToCalendar,
  eomToCeds,
  eomToSchemaOrg,
  mapInput,
  schemaOrgToEom,
  type AdapterFormat,
} from '@paperandslate/eom-adapters';
import { parseStrictJson } from '@paperandslate/eom-core';
import { validateDocument } from '@paperandslate/eom-validator';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd());

function jsonFixture(path: string): unknown {
  return parseStrictJson(readFileSync(resolve(root, path), 'utf8'), path);
}

function textFixture(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

describe('EOM interoperability mappings', () => {
  it('validates the versioned registry and exposes one reviewed definition per supported format', () => {
    const registry = jsonFixture('mappings/registry.json');
    const validation = validateDocument(registry, { semantic: false });
    expect(validation.valid, JSON.stringify(validation.findings)).toBe(true);
    expect(adapterDefinitions()).toHaveLength(10);
    expect(new Set(adapterDefinitions().map((definition) => definition.format)).size).toBe(10);
    expect(adapterDefinitions().every((definition) => definition.status === 'preview')).toBe(true);
    expect(
      adapterDefinitions().every((definition) => definition.certificationClaim === false),
    ).toBe(true);
  });

  it('maps Schema.org organization metadata into a candidate and claim ledger', () => {
    const result = schemaOrgToEom(jsonFixture('fixtures/mappings/schema-org.json'));
    expect(result.quarantined).toBe(false);
    expect(result.publication).toBe('candidate-only');
    expect(result.candidate).toMatchObject({
      type: 'organization-profile',
      id: 'https://ecme-high.example/#organization',
      name: 'Ecme High School',
      website: 'https://ecme-high.example/',
    });
    expect(result.claims.length).toBeGreaterThan(2);
    for (const claim of result.claims) {
      expect(validateDocument(claim).valid).toBe(true);
      expect(claim).toMatchObject({
        type: 'claim-record',
        method: { kind: 'mapping' },
        authorityClass: 'unknown',
        privacyClass: 'public-review-required',
        review: { state: 'pending' },
      });
    }
  });

  it('covers every official preview adapter with local, public fixtures', () => {
    const cases: readonly [AdapterFormat, string, 'json' | 'text'][] = [
      ['schema-org-jsonld', 'fixtures/mappings/schema-org.json', 'json'],
      ['ceds-json', 'fixtures/mappings/ceds.json', 'json'],
      ['ed-fi-json', 'fixtures/mappings/ed-fi.json', 'json'],
      ['oneroster-json-csv', 'fixtures/mappings/oneroster-public.json', 'json'],
      ['case-json', 'fixtures/mappings/case.json', 'json'],
      ['qti-xml', 'fixtures/mappings/qti-public.xml', 'text'],
      ['lti-public-json', 'fixtures/mappings/lti-public.json', 'json'],
      ['common-cartridge-xml', 'fixtures/mappings/common-cartridge-public.xml', 'text'],
      ['icalendar', 'fixtures/mappings/calendar.ics', 'text'],
      ['json-feed-rss-atom', 'fixtures/mappings/feed.json', 'json'],
    ];

    for (const [format, path, kind] of cases) {
      const input = kind === 'json' ? jsonFixture(path) : textFixture(path);
      const result = mapInput(format, input, {
        sourceId: 'https://ecme-high.example/evidence/mapping-fixture',
      });
      expect(result.findings, format).toHaveLength(0);
      expect(result.quarantined, format).toBe(false);
      expect(result.candidate, format).toBeDefined();
      expect(result.claims.length, format).toBeGreaterThan(0);
      expect(result.lossReport.omitted.length, format).toBeGreaterThan(0);
      for (const claim of result.claims) {
        expect(validateDocument(claim).valid, `${format}: ${JSON.stringify(claim)}`).toBe(true);
      }
    }
  });

  it('keeps the OneRoster public boundary allowlist-based', () => {
    const result = mapInput(
      'oneroster-json-csv',
      jsonFixture('fixtures/mappings/oneroster-public.json'),
    );
    expect(JSON.stringify(result.candidate)).not.toMatch(
      /student|enrollment|grade|attendance|token/iu,
    );
    expect(result.lossReport.omitted).toEqual(
      expect.arrayContaining(['students', 'enrollments', 'grades', 'attendance', 'credentials']),
    );
  });

  it('quarantines prohibited fields and rejects active XML content without echoing input', () => {
    const privateResult = mapInput(
      'oneroster-json-csv',
      jsonFixture('fixtures/mappings/prohibited-input.json'),
    );
    expect(privateResult.quarantined).toBe(true);
    expect(privateResult.candidate).toBeUndefined();
    expect(privateResult.findings[0]?.code).toBe('EOM_ADAPTER_PRIVACY_QUARANTINE');
    expect(JSON.stringify(privateResult)).not.toContain('[redacted test marker]');

    const unsafeResult = mapInput('qti-xml', textFixture('fixtures/mappings/unsafe.xml'));
    expect(unsafeResult.quarantined).toBe(true);
    expect(unsafeResult.candidate).toBeUndefined();
    expect(unsafeResult.findings[0]?.code).toBe('EOM_ADAPTER_ACTIVE_CONTENT_REJECTED');
    expect(JSON.stringify(unsafeResult)).not.toContain('Rejected fixture');
  });

  it('does not promise round trips or certification', () => {
    const result = mapInput('json-feed-rss-atom', jsonFixture('fixtures/mappings/feed.json'));
    expect(result.publication).toBe('candidate-only');
    expect(result.adapterId).toBe('https://paperandslate.org/eom/mappings/json-feed-rss-atom');
    expect(result.lossReport.approximate).toContain('content_html');
    expect(
      adapterDefinitions().every((definition) => definition.certificationClaim === false),
    ).toBe(true);
  });

  it('keeps the supported export projections deterministic and preview-only', () => {
    const organization = {
      type: 'organization-profile',
      id: 'https://ecme-high.example/#organization',
      name: 'Ecme High School',
      organizationType: 'educational-organization',
      website: 'https://ecme-high.example/',
    };
    const schemaOrg = eomToSchemaOrg(organization);
    expect(schemaOrg.publication).toBe('preview-only');
    expect(schemaOrg.document).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'EducationalOrganization',
      '@id': organization.id,
      name: organization.name,
      url: organization.website,
    });

    const ceds = eomToCeds({
      ...organization,
      externalIdentifier: { scheme: 'ceds', value: 'ecme-1' },
    });
    expect(ceds.document).toMatchObject({ organizationId: 'ecme-1', name: organization.name });

    const calendar = eomToCalendar({
      type: 'event',
      id: 'https://ecme-high.example/events/open-house',
      name: 'Open house',
      start: '2027-10-02T18:00:00Z',
      end: '2027-10-02T19:00:00Z',
    });
    expect(calendar.document).toContain('DTSTART:20271002T180000Z');
    expect(calendar.document).toContain('DTEND:20271002T190000Z');
    expect(calendar.document).toBe(
      eomToCalendar({
        type: 'event',
        id: 'https://ecme-high.example/events/open-house',
        name: 'Open house',
        start: '2027-10-02T18:00:00Z',
        end: '2027-10-02T19:00:00Z',
      }).document,
    );
  });

  it('encodes iCalendar line breaks and bounds direct adapter inputs', () => {
    const calendar = eomToCalendar({
      type: 'event',
      id: 'https://ecme-high.example/events/open-house',
      name: 'Open\r\nHouse',
    });
    expect(calendar.findings).toHaveLength(0);
    expect(calendar.document).toContain('SUMMARY:Open\\nHouse');
    expect(calendar.document).not.toContain('SUMMARY:Open\r');

    const rejected = eomToCalendar({
      type: 'event',
      id: 'https://ecme-high.example/events/open-house',
      name: 'Open\u0000House',
    });
    expect(rejected.findings[0]?.code).toBe('EOM_ADAPTER_EXPORT_UNAVAILABLE');

    const limited = mapInput('json-feed-rss-atom', 'oversized', { maxBytes: 4 });
    expect(limited.quarantined).toBe(true);
    expect(limited.findings[0]?.code).toBe('EOM_ADAPTER_BYTES_LIMIT');

    const deep: Record<string, unknown> = { value: 'leaf' };
    const nested = { child: { child: deep } };
    const depthLimited = mapInput('json-feed-rss-atom', nested, { maxDepth: 1 });
    expect(depthLimited.quarantined).toBe(true);
    expect(depthLimited.findings[0]?.code).toBe('EOM_ADAPTER_DEPTH_LIMIT');

    const shared = { title: 'Shared metadata' };
    const dag = mapInput('json-feed-rss-atom', { first: shared, second: shared });
    expect(dag.findings.some((item) => item.code === 'EOM_ADAPTER_CYCLE')).toBe(false);
  });

  it('parses safe RSS/Atom metadata without backtracking on malformed input', () => {
    const feed = mapInput(
      'json-feed-rss-atom',
      '<rss><channel><item><guid>https://ecme-high.example/news/1</guid>' +
        '<title>Open house</title><description><![CDATA[Public &amp; useful]]></description>' +
        '<link href="https://ecme-high.example/news/1" /></item></channel></rss>',
    );
    expect(feed.findings).toHaveLength(0);
    expect(feed.candidate).toMatchObject({
      id: 'https://ecme-high.example/news/1',
      name: 'Open house',
      description: 'Public & useful',
      url: 'https://ecme-high.example/news/1',
    });

    const malformed = mapInput('json-feed-rss-atom', `<item><title>${'unclosed '.repeat(8_000)}`, {
      maxBytes: 100_000,
    });
    expect(malformed.findings).toHaveLength(0);
    expect(malformed.candidate).toMatchObject({
      type: 'news-item',
      name: 'Untitled feed item',
    });
  });
});
