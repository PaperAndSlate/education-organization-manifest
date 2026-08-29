import { generateKeyPairSync } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { isJsonObject, parseStrictJson, stringifyCanonical } from '@paperandslate/eom-core';
import { publicKeyRecord, signDetached } from '@paperandslate/eom-signatures';
import {
  CONFORMANCE_PROFILES,
  conformanceReportSummary,
  runConformance,
  startFixturePublisher,
} from '@paperandslate/eom-testkit';
import { validateDocument } from '@paperandslate/eom-validator';
import {
  isLoopbackFixtureOrigin,
  runConformanceCli,
} from '../apps/conformance-runner/src/index.js';

describe('EOM offline conformance testkit', () => {
  it('limits network safety overrides to explicit loopback fixture publishers', async () => {
    expect(isLoopbackFixtureOrigin('http://127.0.0.1:4174')).toBe(true);
    expect(isLoopbackFixtureOrigin('http://[::1]:4174')).toBe(true);
    expect(isLoopbackFixtureOrigin('https://127.0.0.1:4174')).toBe(false);
    expect(isLoopbackFixtureOrigin('http://localhost:4174')).toBe(false);

    await expect(
      runConformanceCli([
        'examples/ecme-high/public',
        '--origin',
        'https://publisher.example',
        '--allow-private-hosts',
      ]),
    ).resolves.toBe(2);
    await expect(
      runConformanceCli([
        'examples/ecme-high/public',
        '--mode',
        'consumer',
        '--origin',
        'http://127.0.0.1:4174',
        '--fixture-authority-origin',
        'https://ecme-high.example',
        '--allow-http',
      ]),
    ).resolves.toBe(2);
  });

  it('runs the complete fictional Ecme publication through the core publisher profile', async () => {
    const report = await runConformance({
      directory: resolve('examples/ecme-high/public'),
      now: new Date('2027-01-01T00:00:00Z'),
    });
    expect(report.status).toBe('conforming');
    expect(report.profile).toBe(CONFORMANCE_PROFILES['publisher-core'].uri);
    expect(validateDocument(report).valid, JSON.stringify(validateDocument(report).findings)).toBe(
      true,
    );
    expect(conformanceReportSummary(report).checks).toMatchObject({ fail: 0, warn: 0 });
    expect(report.checks.length).toBeGreaterThan(70);
  });

  it('produces a valid diagnostic report for an invalid capture without network access', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-conformance-invalid-'));
    try {
      await writeFile(
        join(root, 'unknown-type.json'),
        await readFile(resolve('fixtures/conformance/invalid/unknown-type.json'), 'utf8'),
        'utf8',
      );
      const report = await runConformance({
        directory: root,
        expected: {
          status: 'non-conforming',
          findingCodes: ['EOM_SCHEMA_UNKNOWN_TYPE'],
        },
      });
      expect(report.status).toBe('non-conforming');
      expect(report.checks.some((check) => check.status === 'fail')).toBe(true);
      expect(
        report.checks.find((check) =>
          check.id.includes('/expected-finding-EOM_SCHEMA_UNKNOWN_TYPE'),
        )?.status,
      ).toBe('pass');
      expect(validateDocument(report).valid).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('runs publication-set semantics and exposes stable cross-document findings', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-conformance-set-'));
    try {
      const resource = await readFile(resolve('fixtures/modules/courses/valid.json'), 'utf8');
      await writeFile(join(root, 'courses-a.json'), resource, 'utf8');
      await writeFile(join(root, 'courses-b.json'), resource, 'utf8');
      const report = await runConformance({
        directory: root,
        expected: {
          status: 'non-conforming',
          findingCodes: ['EOM_PUBLICATION_DUPLICATE_ID'],
        },
      });
      expect(report.checks.find((check) => check.id.endsWith('/publication-set'))?.status).toBe(
        'fail',
      );
      expect(
        report.checks.find((check) =>
          check.id.includes('/expected-finding-EOM_PUBLICATION_DUPLICATE_ID'),
        )?.status,
      ).toBe('pass');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects malformed generator metadata instead of treating filenames as evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-conformance-generator-metadata-'));
    try {
      const capture = join(root, 'public');
      await cp(resolve('examples/ecme-high/public'), capture, { recursive: true });
      await writeFile(
        join(root, '.eom-generated.json'),
        JSON.stringify({
          generator: 'eom',
          specification: 'https://paperandslate.org/spec/eom/1.0',
          toolVersion: '1.0.0-rc.3',
          ownershipVersion: 1,
          buildMode: 'full',
          projectIdentity: 'fixture',
          configDigest: '0'.repeat(64),
          selector: {},
        }) + '\n',
        'utf8',
      );
      await writeFile(join(capture, '.eom-generated.json'), '{"generator":"not-eom"}\n', 'utf8');
      await writeFile(
        join(root, 'reproducibility.json'),
        JSON.stringify({
          deterministic: true,
          canonicalJson: true,
          fingerprint: '0'.repeat(64),
          inputFingerprint: '0'.repeat(64),
        }) + '\n',
        'utf8',
      );
      await writeFile(
        join(capture, 'reproducibility.json'),
        '{"deterministic":false,"canonicalJson":true}\n',
        'utf8',
      );
      const report = await runConformance({
        directory: capture,
        profile: 'generator',
        expected: { status: 'non-conforming' },
      });
      expect(report.status).toBe('non-conforming');
      expect(report.checks.find((check) => check.id.includes('/generator-marker'))?.status).toBe(
        'fail',
      );
      expect(
        report.checks.find((check) => check.id.includes('/generator-reproducibility'))?.status,
      ).toBe('fail');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('exposes every versioned role/profile required by the conformance model', () => {
    expect(Object.keys(CONFORMANCE_PROFILES).sort()).toEqual([
      'consumer',
      'consumer-core',
      'core',
      'delegated',
      'district',
      'generator',
      'module',
      'publisher-core',
      'school',
      'signature-optional',
      'signed',
      'validator',
    ]);
    expect(
      parseStrictJson(
        readFileSync('fixtures/conformance/expected/ecme-high.json', 'utf8'),
        'expected',
      ),
    ).toMatchObject({
      status: 'conforming',
    });
  });

  it('enforces capture budgets and records consumer adapter observations', async () => {
    const directory = resolve('examples/ecme-high/public');
    const limited = await runConformance({ directory, maxFiles: 1 });
    expect(limited.status).toBe('non-conforming');
    expect(limited.checks.filter((check) => check.id.includes('/capture-file-limit'))).toHaveLength(
      1,
    );

    const observed = await runConformance({
      directory,
      profile: 'consumer',
      consumerAdapter: {
        name: 'fixture-consumer',
        version: '1.0.0',
        run() {
          return Promise.resolve({
            checks: [
              {
                id: 'https://consumer.example/checks/adapter-observed',
                status: 'pass',
                message: 'The adapter observed only local publication files.',
              },
            ],
            notes: ['Adapter observations do not grant publication authority.'],
          });
        },
      },
    });
    expect(observed.status).toBe('partial');
    expect(
      observed.checks.find(
        (check) => check.id === 'https://consumer.example/checks/adapter-observed',
      )?.status,
    ).toBe('pass');
    expect(observed.checks.find((check) => check.id.includes('/consumer-note'))?.status).toBe(
      'warn',
    );
  });

  it('verifies a real detached signature in the signed profile', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'eom-conformance-signed-'));
    try {
      const resource = parseStrictJson(
        await readFile(resolve('fixtures/signatures/unsigned-resource.json'), 'utf8'),
        'fixtures/signatures/unsigned-resource.json',
      );
      if (!isJsonObject(resource)) throw new Error('The signature fixture must be an object.');
      const { privateKey, publicKey } = generateKeyPairSync('ed25519');
      const keyId = 'https://signed.example/eom/keys#2027';
      const signature = signDetached(resource, {
        privateKey,
        keyId,
        createdAt: '2027-08-01T00:00:00Z',
        expires: '2030-08-01T00:00:00Z',
      });
      const keySet = {
        $schema: 'https://paperandslate.org/schemas/eom/1.0/key-set.schema.json',
        specification: 'https://paperandslate.org/spec/eom/1.0',
        version: '1.0',
        id: 'https://signed.example/eom/keys',
        type: 'key-set',
        canonical: 'https://signed.example/eom/keys.json',
        keys: [
          publicKeyRecord(publicKey, {
            keyId,
            owner: 'https://signed.example/id/school',
            validUntil: '2030-01-01T00:00:00Z',
          }),
        ],
        expires: '2030-01-01T00:00:00Z',
      };
      await writeFile(join(directory, 'resource.json'), stringifyCanonical(resource), 'utf8');
      await writeFile(
        join(directory, 'signature.json'),
        stringifyCanonical(signature as never),
        'utf8',
      );
      await writeFile(join(directory, 'keys.json'), stringifyCanonical(keySet), 'utf8');
      const report = await runConformance({
        directory,
        profile: 'signed',
        now: new Date('2027-08-01T00:00:00Z'),
      });
      expect(report.status).toBe('conforming');
      const signatureCheck = report.checks.find((check) =>
        check.id.includes('/signature-cryptographic'),
      );
      expect(signatureCheck?.status).toBe('pass');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('exercises the controlled publisher endpoint and HTTP conformance checks', async () => {
    const publisher = await startFixturePublisher({
      directory: resolve('examples/ecme-high/public'),
    });
    try {
      const report = await runConformance({
        directory: resolve('examples/ecme-high/public'),
        origin: publisher.origin,
        mode: 'publisher',
        fixtureAuthorityOrigin: 'https://ecme-high.example',
        fetch: {
          allowHttp: true,
          allowPrivateHosts: true,
          allowNonStandardPorts: true,
        },
      });
      expect(report.status).toBe('conforming');
      expect(report.checks.find((check) => check.id.includes('/publisher-discovery'))?.status).toBe(
        'pass',
      );
      expect(report.checks.find((check) => check.id.includes('/publisher-head'))?.status).toBe(
        'pass',
      );
      expect(report.checks.find((check) => check.id.includes('/publisher-graph'))?.status).toBe(
        'pass',
      );
      expect(publisher.requests.some((request) => request.method === 'HEAD')).toBe(true);
    } finally {
      await publisher.close();
    }
  });

  it('evaluates every descriptor when multiple publisher entries share one URL', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'eom-conformance-descriptor-collision-'));
    try {
      await mkdir(join(directory, '.well-known'), { recursive: true });
      await mkdir(join(directory, 'eom'), { recursive: true });
      const manifest = structuredClone(
        parseStrictJson(
          await readFile(resolve('fixtures/valid/core/minimal-school-manifest.json'), 'utf8'),
          'minimal-school-manifest.json',
        ),
      ) as Record<string, unknown>;
      const [organization] = (manifest.resources as Array<Record<string, unknown>>).filter(
        (resource) => resource.type === 'organization-profile',
      );
      if (!organization) throw new Error('The fixture must contain an organization descriptor.');
      manifest.capabilities = [];
      manifest.resources = [
        organization,
        {
          ...organization,
          subjects: ['https://ecme-high.example/id/another-school'],
        },
      ];
      await writeFile(
        join(directory, '.well-known', 'educational-organization-manifest'),
        stringifyCanonical(manifest as never),
        'utf8',
      );
      await writeFile(
        join(directory, 'eom', 'organization.json'),
        await readFile(resolve('fixtures/valid/core/minimal-school-organization.json'), 'utf8'),
        'utf8',
      );
      const publisher = await startFixturePublisher({ directory });
      try {
        const report = await runConformance({
          directory,
          origin: publisher.origin,
          mode: 'publisher',
          fixtureAuthorityOrigin: 'https://ecme-high.example',
          fetch: {
            allowHttp: true,
            allowPrivateHosts: true,
            allowNonStandardPorts: true,
          },
          expected: {
            findingCodes: ['EOM_AUTHORITY_DESCRIPTOR_MISMATCH'],
          },
        });
        expect(report.status).toBe('non-conforming');
        expect(report.checks.find((check) => check.id.includes('/publisher-graph'))?.status).toBe(
          'fail',
        );
      } finally {
        await publisher.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('reports symlink entries in captured publications instead of skipping them', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'eom-conformance-capture-symlink-'));
    const outside = await mkdtemp(join(tmpdir(), 'eom-conformance-capture-target-'));
    try {
      await writeFile(
        join(directory, 'manifest.json'),
        await readFile(resolve('fixtures/valid/core/minimal-school-manifest.json'), 'utf8'),
        'utf8',
      );
      await writeFile(join(outside, 'outside.json'), '{}\n', 'utf8');
      try {
        await symlink(join(outside, 'outside.json'), join(directory, 'linked.json'));
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          ['EPERM', 'EACCES', 'EINVAL'].includes(String(error.code))
        ) {
          return;
        }
        throw error;
      }
      const report = await runConformance({ directory });
      expect(report.status).toBe('non-conforming');
      expect(report.checks.find((check) => check.id.includes('/capture-symlink'))?.status).toBe(
        'fail',
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});
