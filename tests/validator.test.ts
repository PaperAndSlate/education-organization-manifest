import { readFileSync } from 'node:fs';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_STABLE_JSON_BYTES,
  parseStrictJson,
  type FetchResponse,
  type ManifestFetchResponse,
} from '@paperandslate/eom-core';
import {
  MAX_SEMANTIC_COURSE_CODE_FINDINGS,
  publicationSetFindings,
  renderValidationReport,
  semanticFindings,
  validateDocument,
  validatePublicationDirectory,
  validatePublicationUrl,
} from '@paperandslate/eom-validator';

const root = resolve(process.cwd());

function fixture(path: string): unknown {
  return parseStrictJson(readFileSync(resolve(root, path), 'utf8'), path);
}

describe('EOM structural and semantic validation', () => {
  it('renders the conformance report format as a schema-valid conformance report', () => {
    const report = parseStrictJson(
      renderValidationReport(
        {
          valid: true,
          structuralValid: true,
          semanticValid: true,
          findings: [],
        },
        'conformance',
      ),
    );
    expect(report).toMatchObject({
      type: 'conformance-report',
      status: 'conforming',
      profile: 'https://paperandslate.org/spec/eom/1.0/profiles/validator',
    });
    expect(
      validateDocument(report, { schemaFile: 'conformance-report.schema.json', semantic: false })
        .valid,
    ).toBe(true);
  });

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

  it('rejects sparse and cyclic runtime values before schema or semantic traversal', () => {
    const sparse = [] as unknown[];
    sparse.length = 1;
    const sparseResult = validateDocument({
      type: 'manifest',
      resources: sparse,
    });
    expect(sparseResult.valid).toBe(false);
    expect(sparseResult.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EOM_JSON_UNSUPPORTED_VALUE' })]),
    );

    const cyclic: Record<string, unknown> = { type: 'manifest' };
    cyclic.self = cyclic;
    const cyclicResult = validateDocument(cyclic);
    expect(cyclicResult.valid).toBe(false);
    expect(cyclicResult.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EOM_JSON_CYCLE' })]),
    );
  });

  it('rejects oversized runtime JSON string data before schema validation', () => {
    const result = validateDocument(
      { type: 'manifest', description: 'x'.repeat(MAX_STABLE_JSON_BYTES + 1) },
      { semantic: false },
    );
    expect(result.valid).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EOM_JSON_INPUT_TOO_LARGE' })]),
    );
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
        type: 'delegation',
        id: 'https://ecme-high.example/id/delegation/vendor-organization',
        delegate: 'https://vendor.example',
        subject: 'https://ecme-high.example/id/school',
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

  it('binds fetched resources to their observed final URL and records redirect provenance', async () => {
    const manifest = fixture('fixtures/valid/core/minimal-school-manifest.json') as Record<
      string,
      unknown
    >;
    manifest.capabilities = [];
    manifest.resources = [
      {
        id: 'https://ecme-high.example/eom/resource/organization',
        type: 'organization-profile',
        href: 'https://ecme-high.example/eom/organization.json',
        mediaType: 'application/json',
        version: '1.0',
        subjects: ['https://ecme-high.example/id/school'],
      },
    ];
    const resourceDocument = fixture('fixtures/valid/core/minimal-school-organization.json');
    const rootResponse: ManifestFetchResponse = {
      requestedUrl: 'https://ecme-high.example/.well-known/educational-organization-manifest',
      finalUrl: 'https://ecme-high.example/.well-known/educational-organization-manifest',
      status: 200,
      headers: { 'content-type': 'application/json' },
      contentType: 'application/json',
      body: JSON.stringify(manifest),
      redirects: [],
      observedAt: '2027-08-01T00:00:00.000Z',
      document: manifest as never,
    };
    const transport = {
      fetchManifest: (): Promise<ManifestFetchResponse> => Promise.resolve(rootResponse),
      fetchEom: (url: string): Promise<FetchResponse> =>
        Promise.resolve({
          requestedUrl: url,
          finalUrl: 'https://evil.example/eom/organization.json',
          status: 200,
          headers: { 'content-type': 'application/json' },
          contentType: 'application/json',
          body: JSON.stringify(resourceDocument),
          redirects: [
            {
              from: url,
              to: 'https://evil.example/eom/organization.json',
              status: 302,
              crossOrigin: true,
            },
          ],
          observedAt: '2027-08-01T00:00:00.000Z',
        }),
    };
    const result = await validatePublicationUrl('https://ecme-high.example', {
      transport,
      now: new Date('2027-08-01T00:00:00Z'),
    });
    expect(result.valid).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EOM_AUTHORITY_UNVERIFIED_EXTERNAL' }),
      ]),
    );
    expect(result.fetches[1]).toMatchObject({
      declaredUrl: 'https://ecme-high.example/eom/organization.json',
      finalUrl: 'https://evil.example/eom/organization.json',
    });
  });

  it('does not trust declarations from a resource rejected by final-url authority', async () => {
    const manifest = fixture('fixtures/valid/core/minimal-school-manifest.json') as Record<
      string,
      unknown
    >;
    manifest.capabilities = [];
    manifest.resources = [
      {
        id: 'https://ecme-high.example/eom/resource/organization',
        type: 'organization-profile',
        href: 'https://ecme-high.example/eom/organization.json',
        mediaType: 'application/json',
        version: '1.0',
        subjects: ['https://ecme-high.example/id/school'],
      },
    ];
    const rootResponse: ManifestFetchResponse = {
      requestedUrl: 'https://ecme-high.example/.well-known/educational-organization-manifest',
      finalUrl: 'https://ecme-high.example/.well-known/educational-organization-manifest',
      status: 200,
      headers: { 'content-type': 'application/json' },
      contentType: 'application/json',
      body: JSON.stringify(manifest),
      redirects: [],
      observedAt: '2027-08-01T00:00:00.000Z',
      document: manifest as never,
    };
    let resourceFetches = 0;
    const transport = {
      fetchManifest: (): Promise<ManifestFetchResponse> => Promise.resolve(rootResponse),
      fetchEom: (url: string): Promise<FetchResponse> => {
        resourceFetches += 1;
        return Promise.resolve({
          requestedUrl: url,
          finalUrl: 'https://evil.example/eom/organization.json',
          status: 200,
          headers: { 'content-type': 'application/json' },
          contentType: 'application/json',
          body: JSON.stringify({
            type: 'organization-profile',
            id: 'https://evil.example/id/organization',
            name: 'Unauthorized resource',
            organizationType: 'secondary-school',
            resources: [
              {
                id: 'https://evil.example/eom/resource/nested',
                type: 'news-feed',
                href: 'https://public.example/eom/nested.json',
                mediaType: 'application/json',
                version: '1.0',
              },
            ],
          }),
          redirects: [
            {
              from: url,
              to: 'https://evil.example/eom/organization.json',
              status: 302,
              crossOrigin: true,
            },
          ],
          observedAt: '2027-08-01T00:00:00.000Z',
        });
      },
    };
    const result = await validatePublicationUrl('https://ecme-high.example', {
      transport,
      now: new Date('2027-08-01T00:00:00Z'),
    });
    expect(result.valid).toBe(false);
    expect(resourceFetches).toBe(1);
    expect(result.fetches.map((item) => item.declaredUrl)).not.toContain(
      'https://public.example/eom/nested.json',
    );
  });

  it('reports malformed fetched resource JSON as a fetch finding', async () => {
    const manifest = structuredClone(
      fixture('fixtures/valid/core/minimal-school-manifest.json'),
    ) as Record<string, unknown>;
    manifest.capabilities = [];
    const resource = (manifest.resources as Array<Record<string, unknown>>)[0]!;
    const rootResponse: ManifestFetchResponse = {
      requestedUrl: 'https://ecme-high.example/.well-known/educational-organization-manifest',
      finalUrl: 'https://ecme-high.example/.well-known/educational-organization-manifest',
      status: 200,
      headers: { 'content-type': 'application/json' },
      contentType: 'application/json',
      body: JSON.stringify(manifest),
      redirects: [],
      observedAt: '2027-08-01T00:00:00.000Z',
      document: manifest as never,
    };
    const result = await validatePublicationUrl('https://ecme-high.example', {
      transport: {
        fetchManifest: (): Promise<ManifestFetchResponse> => Promise.resolve(rootResponse),
        fetchEom: (url: string): Promise<FetchResponse> =>
          Promise.resolve({
            requestedUrl: url,
            finalUrl: resource.href as string,
            status: 200,
            headers: { 'content-type': 'application/json' },
            contentType: 'application/json',
            body: '{',
            redirects: [],
            observedAt: '2027-08-01T00:00:00.000Z',
          }),
      },
    });
    expect(result.valid).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EOM_FETCH_JSON', resource: resource.href }),
      ]),
    );
  });

  it('records final URL and redirects when the graph byte budget stops a fetch', async () => {
    const manifest = structuredClone(
      fixture('fixtures/valid/core/minimal-school-manifest.json'),
    ) as Record<string, unknown>;
    manifest.capabilities = [];
    const resource = (manifest.resources as Array<Record<string, unknown>>)[0]!;
    const rootResponse: ManifestFetchResponse = {
      requestedUrl: 'https://ecme-high.example/.well-known/educational-organization-manifest',
      finalUrl: 'https://ecme-high.example/.well-known/educational-organization-manifest',
      status: 200,
      headers: { 'content-type': 'application/json' },
      contentType: 'application/json',
      body: JSON.stringify(manifest),
      redirects: [],
      observedAt: '2027-08-01T00:00:00.000Z',
      document: manifest as never,
    };
    const redirectTarget = 'https://ecme-high.example/eom/organization-final.json';
    const resourceBody = JSON.stringify({
      type: 'organization-profile',
      id: 'https://ecme-high.example/id/organization',
      name: 'x'.repeat(256),
    });
    const result = await validatePublicationUrl('https://ecme-high.example', {
      maxTotalBytes: Buffer.byteLength(rootResponse.body, 'utf8') + 1,
      transport: {
        fetchManifest: (): Promise<ManifestFetchResponse> => Promise.resolve(rootResponse),
        fetchEom: (url: string): Promise<FetchResponse> =>
          Promise.resolve({
            requestedUrl: url,
            finalUrl: redirectTarget,
            status: 200,
            headers: { 'content-type': 'application/json' },
            contentType: 'application/json',
            body: resourceBody,
            redirects: [
              {
                from: url,
                to: redirectTarget,
                status: 302,
                crossOrigin: false,
              },
            ],
            observedAt: '2027-08-01T00:00:00.000Z',
          }),
      },
    });
    expect(result.valid).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EOM_GRAPH_TOTAL_BYTES' })]),
    );
    expect(result.fetches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          declaredUrl: resource.href,
          finalUrl: redirectTarget,
          redirects: [
            expect.objectContaining({
              from: resource.href,
              to: redirectTarget,
            }),
          ],
        }),
      ]),
    );
  });

  it('does not charge an in-run cache hit twice against the graph byte budget', async () => {
    const manifest = structuredClone(
      fixture('fixtures/valid/core/minimal-school-manifest.json'),
    ) as Record<string, unknown>;
    manifest.capabilities = [];
    const resources = manifest.resources as Array<Record<string, unknown>>;
    const firstResource = resources[0]!;
    resources.splice(
      0,
      resources.length,
      {
        ...firstResource,
        id: 'https://ecme-high.example/eom/resource/organization-first',
      },
      {
        ...firstResource,
        id: 'https://ecme-high.example/eom/resource/organization-second',
      },
    );
    const rootResponse: ManifestFetchResponse = {
      requestedUrl: 'https://ecme-high.example/.well-known/educational-organization-manifest',
      finalUrl: 'https://ecme-high.example/.well-known/educational-organization-manifest',
      status: 200,
      headers: { 'content-type': 'application/json' },
      contentType: 'application/json',
      body: JSON.stringify(manifest),
      redirects: [],
      observedAt: '2027-08-01T00:00:00.000Z',
      document: manifest as never,
    };
    const resourceDocument = fixture('fixtures/valid/core/minimal-school-organization.json');
    const resourceBody = JSON.stringify(resourceDocument);
    const result = await validatePublicationUrl('https://ecme-high.example', {
      maxTotalBytes:
        Buffer.byteLength(rootResponse.body, 'utf8') + Buffer.byteLength(resourceBody, 'utf8'),
      transport: {
        fetchManifest: (): Promise<ManifestFetchResponse> => Promise.resolve(rootResponse),
        fetchEom: (url: string): Promise<FetchResponse> =>
          Promise.resolve({
            requestedUrl: url,
            finalUrl: firstResource.href as string,
            status: 200,
            headers: { 'content-type': 'application/json' },
            contentType: 'application/json',
            body: resourceBody,
            redirects: [],
            observedAt: '2027-08-01T00:00:00.000Z',
          }),
      },
    });
    expect(result.findings.some((item) => item.code === 'EOM_GRAPH_TOTAL_BYTES')).toBe(false);
  });

  it('reports URL graph depth exhaustion instead of silently truncating descendants', async () => {
    const manifest = structuredClone(
      fixture('fixtures/valid/core/minimal-school-manifest.json'),
    ) as Record<string, unknown>;
    manifest.capabilities = [];
    const firstResource = {
      id: 'https://ecme-high.example/eom/resource/one',
      type: 'manifest',
      href: 'https://ecme-high.example/eom/one.json',
      mediaType: 'application/json',
      version: '1.0',
      subjects: ['https://ecme-high.example/eom/resource/one'],
    };
    manifest.resources = [firstResource];
    const secondResource = {
      id: 'https://ecme-high.example/eom/resource/two',
      type: 'manifest',
      href: 'https://ecme-high.example/eom/two.json',
      mediaType: 'application/json',
      version: '1.0',
      subjects: ['https://ecme-high.example/eom/resource/two'],
    };
    const firstDocument = {
      $schema: 'https://paperandslate.org/schemas/eom/1.0/manifest.schema.json',
      specification: 'https://paperandslate.org/spec/eom/1.0',
      version: '1.0',
      id: firstResource.id,
      type: 'manifest',
      canonical: firstResource.href,
      publisher: {
        id: 'https://ecme-high.example/id/publisher',
        name: 'Ecme High School',
        type: 'school',
        website: 'https://ecme-high.example/',
      },
      scope: { origin: 'https://ecme-high.example', paths: ['/'] },
      organizations: [],
      capabilities: [],
      resources: [secondResource],
    };
    const rootResponse: ManifestFetchResponse = {
      requestedUrl: 'https://ecme-high.example/.well-known/educational-organization-manifest',
      finalUrl: 'https://ecme-high.example/.well-known/educational-organization-manifest',
      status: 200,
      headers: { 'content-type': 'application/json' },
      contentType: 'application/json',
      body: JSON.stringify(manifest),
      redirects: [],
      observedAt: '2027-08-01T00:00:00.000Z',
      document: manifest as never,
    };
    let fetchedSecond = false;
    const result = await validatePublicationUrl('https://ecme-high.example', {
      maxDepth: 1,
      transport: {
        fetchManifest: (): Promise<ManifestFetchResponse> => Promise.resolve(rootResponse),
        fetchEom: (url: string): Promise<FetchResponse> => {
          if (url === secondResource.href) fetchedSecond = true;
          return Promise.resolve({
            requestedUrl: url,
            finalUrl: firstResource.href,
            status: 200,
            headers: { 'content-type': 'application/json' },
            contentType: 'application/json',
            body: JSON.stringify(firstDocument),
            redirects: [],
            observedAt: '2027-08-01T00:00:00.000Z',
          });
        },
      },
    });
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EOM_GRAPH_DEPTH_LIMIT' })]),
    );
    expect(fetchedSecond).toBe(false);
  });

  it('rejects a cross-origin redirect while discovering the root manifest', async () => {
    const manifest = fixture('fixtures/valid/core/minimal-school-manifest.json');
    const rootResponse: ManifestFetchResponse = {
      requestedUrl: 'https://ecme-high.example/.well-known/educational-organization-manifest',
      finalUrl: 'https://evil.example/.well-known/educational-organization-manifest',
      status: 200,
      headers: { 'content-type': 'application/json' },
      contentType: 'application/json',
      body: JSON.stringify(manifest),
      redirects: [
        {
          from: 'https://ecme-high.example/.well-known/educational-organization-manifest',
          to: 'https://evil.example/.well-known/educational-organization-manifest',
          status: 302,
          crossOrigin: true,
        },
      ],
      observedAt: '2027-08-01T00:00:00.000Z',
      document: manifest as never,
    };
    const result = await validatePublicationUrl('https://ecme-high.example', {
      fetchGraph: false,
      transport: {
        fetchManifest: (): Promise<ManifestFetchResponse> => Promise.resolve(rootResponse),
        fetchEom: (): Promise<FetchResponse> =>
          Promise.reject(new Error('root redirect test must not fetch resources')),
      },
    });
    expect(result.valid).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EOM_AUTHORITY_ROOT_REDIRECT_ORIGIN' }),
      ]),
    );
  });

  it('evaluates a resource descriptor that points back to the already fetched root', async () => {
    const manifest = structuredClone(
      fixture('fixtures/valid/core/minimal-school-manifest.json'),
    ) as Record<string, unknown>;
    manifest.capabilities = [];
    manifest.resources = [
      {
        id: manifest.id,
        type: 'manifest',
        href: manifest.canonical,
        mediaType: 'application/json',
        version: '1.0',
        subjects: ['https://ecme-high.example/id/not-the-school'],
      },
    ];
    const rootResponse: ManifestFetchResponse = {
      requestedUrl: 'https://ecme-high.example/.well-known/educational-organization-manifest',
      finalUrl: 'https://ecme-high.example/.well-known/educational-organization-manifest',
      status: 200,
      headers: { 'content-type': 'application/json' },
      contentType: 'application/json',
      body: JSON.stringify(manifest),
      redirects: [],
      observedAt: '2027-08-01T00:00:00.000Z',
      document: manifest as never,
    };
    let fetchedResource = false;
    const result = await validatePublicationUrl('https://ecme-high.example', {
      transport: {
        fetchManifest: (): Promise<ManifestFetchResponse> => Promise.resolve(rootResponse),
        fetchEom: (): Promise<FetchResponse> => {
          fetchedResource = true;
          return Promise.reject(new Error('the root cache should satisfy this descriptor'));
        },
      },
    });
    expect(fetchedResource).toBe(false);
    expect(result.valid).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EOM_AUTHORITY_DESCRIPTOR_MISMATCH' }),
      ]),
    );
  });

  it('reports malformed resource URLs without throwing during graph discovery', async () => {
    const manifest = structuredClone(
      fixture('fixtures/valid/core/minimal-school-manifest.json'),
    ) as Record<string, unknown>;
    const resources = manifest.resources as Array<Record<string, unknown>>;
    resources[0] = { ...resources[0], href: 'not a URL' };
    const rootResponse: ManifestFetchResponse = {
      requestedUrl: 'https://ecme-high.example/.well-known/educational-organization-manifest',
      finalUrl: 'https://ecme-high.example/.well-known/educational-organization-manifest',
      status: 200,
      headers: { 'content-type': 'application/json' },
      contentType: 'application/json',
      body: JSON.stringify(manifest),
      redirects: [],
      observedAt: '2027-08-01T00:00:00.000Z',
      document: manifest as never,
    };
    const result = await validatePublicationUrl('https://ecme-high.example', {
      transport: {
        fetchManifest: (): Promise<ManifestFetchResponse> => Promise.resolve(rootResponse),
        fetchEom: (): Promise<FetchResponse> =>
          Promise.reject(new Error('must not fetch malformed href')),
      },
    });
    expect(result.valid).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EOM_RESOURCE_URL_INVALID' })]),
    );
  });

  it('enforces one wall-clock budget across the complete publication graph', async () => {
    const manifest = structuredClone(
      fixture('fixtures/valid/core/minimal-school-manifest.json'),
    ) as Record<string, unknown>;
    manifest.capabilities = [];
    const rootResponse: ManifestFetchResponse = {
      requestedUrl: 'https://ecme-high.example/.well-known/educational-organization-manifest',
      finalUrl: 'https://ecme-high.example/.well-known/educational-organization-manifest',
      status: 200,
      headers: { 'content-type': 'application/json' },
      contentType: 'application/json',
      body: JSON.stringify(manifest),
      redirects: [],
      observedAt: '2027-08-01T00:00:00.000Z',
      document: manifest as never,
    };
    const startedAt = Date.now();
    const result = await validatePublicationUrl('https://ecme-high.example', {
      maxTotalTimeMs: 25,
      transport: {
        fetchManifest: (): Promise<ManifestFetchResponse> => Promise.resolve(rootResponse),
        fetchEom: (): Promise<FetchResponse> => new Promise(() => undefined),
      },
    });
    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(result.valid).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EOM_FETCH_TIMEOUT' })]),
    );
  });

  it('bounds local publication reads before allocating oversized files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'eom-validator-bounded-'));
    try {
      await writeFile(
        join(directory, 'oversized.json'),
        JSON.stringify({ type: 'organization-profile', name: 'x'.repeat(256) }),
        'utf8',
      );
      const result = await validatePublicationDirectory(directory, {
        maxBytes: 64,
        maxTotalBytes: 1024,
      });
      expect(result.valid).toBe(false);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'EOM_GRAPH_FILE_BYTES',
            resource: 'oversized.json',
          }),
        ]),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('reports publication symlinks instead of silently omitting them', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'eom-publication-symlink-'));
    const outsideDirectory = await mkdtemp(join(tmpdir(), 'eom-publication-symlink-target-'));
    const outsideFile = join(outsideDirectory, 'resource.json');
    const linkedFile = join(directory, 'resource.json');
    try {
      await writeFile(outsideFile, '{}', 'utf8');
      try {
        await symlink(outsideFile, linkedFile, 'file');
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          (error.code === 'EACCES' || error.code === 'EPERM' || error.code === 'EINVAL')
        ) {
          return;
        }
        throw error;
      }
      const result = await validatePublicationDirectory(directory);
      expect(result.valid).toBe(false);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'EOM_GRAPH_SYMLINK', resource: 'resource.json' }),
        ]),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
      await rm(outsideDirectory, { recursive: true, force: true });
    }
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
        type: 'delegation',
        id: 'https://ecme-high.example/id/delegation/vendor-organization',
        delegate: 'https://vendor.example',
        subject: 'https://ecme-high.example/id/school',
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

  it('bounds repeated course-code comparisons and reports a failed validation', () => {
    const items = Array.from({ length: 600 }, (_, index) => ({
      id: `https://catalog.example/id/course/${index}`,
      type: 'course',
      name: `Course ${index}`,
      code: 'SHARED',
      effective: {
        from: `${2000 + index}-01-01T00:00:00Z`,
        until: `${2000 + index}-01-01T00:00:00Z`,
      },
    }));
    const findings = semanticFindings({ type: 'course-catalog', items });

    expect(findings.some((item) => item.code === 'EOM_SEMANTIC_WORK_LIMIT')).toBe(true);
    expect(findings.filter((item) => item.code === 'EOM_COURSE_CODE_OVERLAP')).toHaveLength(0);
  });

  it('keeps normal course-code overlap detection bounded to one finding per course', () => {
    const findings = semanticFindings({
      type: 'course-catalog',
      items: [
        {
          id: 'https://catalog.example/id/course/one',
          type: 'course',
          name: 'Course One',
          code: 'SHARED',
        },
        {
          id: 'https://catalog.example/id/course/two',
          type: 'course',
          name: 'Course Two',
          code: 'SHARED',
        },
      ],
    });

    expect(findings.filter((item) => item.code === 'EOM_COURSE_CODE_OVERLAP')).toHaveLength(1);
    expect(findings.some((item) => item.code === 'EOM_SEMANTIC_WORK_LIMIT')).toBe(false);
  });

  it('bounds overlap finding output for an all-overlap course-code catalog', () => {
    const items = Array.from({ length: MAX_SEMANTIC_COURSE_CODE_FINDINGS + 8 }, (_, index) => ({
      id: `https://catalog.example/id/course/overlap-${index}`,
      type: 'course',
      name: `Overlap Course ${index}`,
      code: 'SHARED',
    }));
    const findings = semanticFindings({ type: 'course-catalog', items });

    expect(findings.some((item) => item.code === 'EOM_SEMANTIC_WORK_LIMIT')).toBe(true);
    expect(findings.filter((item) => item.code === 'EOM_COURSE_CODE_OVERLAP')).toHaveLength(
      MAX_SEMANTIC_COURSE_CODE_FINDINGS,
    );
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

  it('reports module-specific date ordering with an exact item pointer', () => {
    const fixtures = fixture('fixtures/valid/modules/catalog-fixtures.json') as Record<
      string,
      unknown
    >;
    const eventCatalog = structuredClone(fixtures['event-catalog']) as Record<string, unknown>;
    const items = eventCatalog.items as Array<Record<string, unknown>>;
    items[0] = {
      ...items[0],
      start: '2027-10-10T18:00:00Z',
      end: '2027-10-10T17:00:00Z',
    };
    const result = validateDocument(eventCatalog);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'EOM_EVENT_DATE_ORDER',
          pointer: '/items/0/end',
        }),
      ]),
    );
  });
});
