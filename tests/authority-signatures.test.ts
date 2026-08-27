import { generateKeyPairSync, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateAuthority } from '@paperandslate/eom-authority';
import {
  canonicalizeJson,
  canonicalizeJsonText,
  publicKeyRecord,
  signDetached,
  verifyDetached,
  verifyUnsigned,
} from '@paperandslate/eom-signatures';
import { validateDocument } from '@paperandslate/eom-validator';

const root = resolve(process.cwd());

function fixture(path: string): unknown {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8')) as unknown;
}

function rootManifest(delegation: unknown): unknown {
  return {
    scope: { origin: 'https://ecme-high.example', paths: ['/'] },
    organizations: [{ id: 'https://ecme-high.example/id/school' }],
    delegations: [delegation],
  };
}

function delegatedResource(type: string, id: string): unknown {
  return {
    type,
    id,
    subjects: ['https://ecme-high.example/id/school'],
  };
}

describe('EOM delegated authority', () => {
  it('accepts scoped vendor and district resources while preserving root identity', () => {
    const vendor = fixture('fixtures/delegation/vendor-meals.json');
    const district = fixture('fixtures/delegation/district-transport.json');
    expect(validateDocument(vendor).valid).toBe(true);
    expect(validateDocument(district).valid).toBe(true);
    const now = new Date('2027-08-01T00:00:00Z');
    const meal = evaluateAuthority(
      rootManifest(vendor),
      delegatedResource('meal-menu-catalog', 'https://ecme-high.example/eom/resource/meals'),
      'https://menus.vendor.example/customers/ecme-high/meals.json',
      { now },
    );
    const transport = evaluateAuthority(
      rootManifest(district),
      delegatedResource(
        'transportation-catalog',
        'https://ecme-high.example/eom/resource/transportation',
      ),
      'https://transport.district.example/public/ecme-high/routes.json',
      { now },
    );
    expect(meal).toMatchObject({ accepted: true, trustLabel: 'delegated', rootAuthority: false });
    expect(transport).toMatchObject({ accepted: true, trustLabel: 'delegated' });
  });

  it('rejects out-of-scope, expired, revoked, and transitive delegation', () => {
    const base = fixture('fixtures/delegation/vendor-meals.json') as Record<string, unknown>;
    const resource = delegatedResource(
      'meal-menu-catalog',
      'https://ecme-high.example/eom/resource/meals',
    ) as Record<string, unknown>;
    const now = new Date('2027-08-01T00:00:00Z');
    expect(
      evaluateAuthority(
        rootManifest(base),
        resource,
        'https://menus.vendor.example/customers/other-school/meals.json',
        { now },
      ).accepted,
    ).toBe(false);
    expect(
      evaluateAuthority(
        rootManifest({ ...base, validUntil: '2027-07-01T00:00:00Z' }),
        resource,
        'https://menus.vendor.example/customers/ecme-high/meals.json',
        { now },
      ).findings,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EOM_DELEGATION_EXPIRED' })]),
    );
    expect(
      evaluateAuthority(
        rootManifest({ ...base, status: 'revoked' }),
        resource,
        'https://menus.vendor.example/customers/ecme-high/meals.json',
        { now },
      ).findings,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EOM_DELEGATION_REVOKED' })]),
    );
    expect(
      evaluateAuthority(
        rootManifest({ ...base, transitive: true }),
        resource,
        'https://menus.vendor.example/customers/ecme-high/meals.json',
        { now },
      ).findings,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EOM_DELEGATION_TRANSITIVE_FORBIDDEN' }),
      ]),
    );
  });

  it('accepts root-origin resources and rejects root paths outside scope', () => {
    const manifest = { scope: { origin: 'https://ecme-high.example', paths: ['/eom/'] } };
    const resource = delegatedResource(
      'meal-menu-catalog',
      'https://ecme-high.example/eom/resource/meals',
    );
    expect(
      evaluateAuthority(manifest, resource, 'https://ecme-high.example/eom/meals.json').accepted,
    ).toBe(true);
    expect(
      evaluateAuthority(manifest, resource, 'https://ecme-high.example/private/meals.json')
        .accepted,
    ).toBe(false);
  });

  it('does not bypass an explicit delegation when the final URL remains on the root origin', () => {
    const delegation = fixture('fixtures/delegation/vendor-meals.json');
    const resource = {
      ...(delegatedResource(
        'meal-menu-catalog',
        'https://ecme-high.example/eom/resource/meals',
      ) as Record<string, unknown>),
      authority: {
        delegation: 'https://ecme-high.example/id/delegation/meal-provider',
      },
    };
    const result = evaluateAuthority(
      rootManifest(delegation),
      resource,
      'https://ecme-high.example/eom/meals.json',
      {
        now: new Date('2027-08-01T00:00:00Z'),
        verifiedKeyId: 'https://ecme-high.example/eom/keys#not-approved',
      },
    );
    expect(result.accepted).toBe(false);
    expect(result.trustLabel).toBe('unverified-external');
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EOM_DELEGATION_ORIGIN_OUT_OF_SCOPE' }),
        expect.objectContaining({ code: 'EOM_DELEGATION_KEY_OUT_OF_SCOPE' }),
      ]),
    );
  });

  it('rejects a root manifest whose declared authority origin differs from its observed origin', () => {
    const result = evaluateAuthority(
      {
        canonical: 'https://evil.example/.well-known/educational-organization-manifest',
        scope: { origin: 'https://evil.example', paths: ['/'] },
      },
      delegatedResource('organization-profile', 'https://evil.example/eom/resource/organization'),
      'https://evil.example/eom/organization.json',
      {
        observedRootUrl: 'https://ecme-high.example/.well-known/educational-organization-manifest',
      },
    );
    expect(result.accepted).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EOM_AUTHORITY_ROOT_ORIGIN_MISMATCH' }),
      ]),
    );
  });

  it('rejects malformed scope arrays instead of silently filtering their entries', () => {
    const resource = delegatedResource(
      'meal-menu-catalog',
      'https://ecme-high.example/eom/resource/meals',
    );
    const rootScopeResult = evaluateAuthority(
      {
        scope: {
          origin: 'https://ecme-high.example',
          paths: ['/'],
          excludedPaths: ['/private', 42],
        },
      },
      resource,
      'https://ecme-high.example/eom/meals.json',
    );
    expect(rootScopeResult.accepted).toBe(false);
    expect(rootScopeResult.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EOM_AUTHORITY_ROOT_SCOPE_INVALID' }),
      ]),
    );

    const base = fixture('fixtures/delegation/vendor-meals.json') as Record<string, unknown>;
    const baseScope = base.scope as Record<string, unknown>;
    for (const [key, value] of [
      ['resourceTypes', ['meal-menu-catalog', 42]],
      ['resourceIds', ['https://ecme-high.example/eom/resource/meals', 42]],
      ['allowedOrigins', ['https://menus.vendor.example', 42]],
      ['allowedPathPrefixes', ['/customers/ecme-high', 42]],
    ] as const) {
      const delegation = {
        ...base,
        scope: { ...baseScope, [key]: value },
      };
      const result = evaluateAuthority(
        rootManifest(delegation),
        resource,
        'https://menus.vendor.example/customers/ecme-high/meals.json',
        { now: new Date('2027-08-01T00:00:00Z') },
      );
      expect(result.accepted, key).toBe(false);
      expect(result.findings, key).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'EOM_DELEGATION_SCOPE_INVALID' })]),
      );
    }
  });

  it('rejects sparse runtime authority arrays instead of treating holes as omitted policy', () => {
    const resource = delegatedResource(
      'meal-menu-catalog',
      'https://ecme-high.example/eom/resource/meals',
    );
    const sparsePaths: string[] = [];
    sparsePaths.length = 1;
    const sparseDelegations: unknown[] = [];
    sparseDelegations.length = 1;
    const result = evaluateAuthority(
      {
        scope: { origin: 'https://ecme-high.example', paths: sparsePaths },
        delegations: sparseDelegations,
      },
      resource,
      'https://ecme-high.example/eom/meals.json',
    );
    expect(result.accepted).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EOM_AUTHORITY_DELEGATIONS_INVALID' }),
        expect.objectContaining({ code: 'EOM_AUTHORITY_ROOT_SCOPE_INVALID' }),
      ]),
    );
  });

  it('fails closed for malformed direct authority inputs', () => {
    const manifest = { scope: { origin: 'https://ecme-high.example', paths: ['/'] } };
    const resource = delegatedResource(
      'meal-menu-catalog',
      'https://ecme-high.example/eom/resource/meals',
    ) as Record<string, unknown>;

    const insecureFinal = evaluateAuthority(
      manifest,
      resource,
      'http://ecme-high.example/eom/meals.json',
    );
    expect(insecureFinal.accepted).toBe(false);
    expect(insecureFinal.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EOM_AUTHORITY_FINAL_URL_INVALID' }),
      ]),
    );

    const insecureRoot = evaluateAuthority(
      { scope: { origin: 'http://ecme-high.example', paths: ['/'] } },
      resource,
      'https://ecme-high.example/eom/meals.json',
    );
    expect(insecureRoot.accepted).toBe(false);
    expect(insecureRoot.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EOM_AUTHORITY_ROOT_ORIGIN_INVALID' }),
      ]),
    );

    const malformedResource = evaluateAuthority(
      manifest,
      { type: 'meal-menu-catalog', id: 'relative-resource-id' },
      'https://ecme-high.example/eom/meals.json',
    );
    expect(malformedResource.accepted).toBe(false);
    expect(malformedResource.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EOM_AUTHORITY_RESOURCE_IDENTITY_INVALID' }),
      ]),
    );

    const malformedAuthority = evaluateAuthority(
      manifest,
      {
        ...resource,
        authority: { delegation: 42 },
      },
      'https://ecme-high.example/eom/meals.json',
    );
    expect(malformedAuthority.accepted).toBe(false);
    expect(malformedAuthority.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EOM_AUTHORITY_RESOURCE_AUTHORITY_INVALID' }),
      ]),
    );

    const declaredOriginMismatch = evaluateAuthority(
      manifest,
      {
        ...resource,
        authority: {
          delegation: 'https://ecme-high.example/id/delegation/meals',
          origin: 'https://other.example',
        },
      },
      'https://ecme-high.example/eom/meals.json',
    );
    expect(declaredOriginMismatch.accepted).toBe(false);
    expect(declaredOriginMismatch.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EOM_AUTHORITY_DECLARED_ORIGIN_MISMATCH' }),
      ]),
    );

    const malformedDelegation = fixture('fixtures/delegation/vendor-meals.json') as Record<
      string,
      unknown
    >;
    const malformedDelegationResult = evaluateAuthority(
      rootManifest({ ...malformedDelegation, id: 'relative-delegation-id' }),
      resource,
      'https://menus.vendor.example/customers/ecme-high/meals.json',
      { now: new Date('2027-08-01T00:00:00Z') },
    );
    expect(malformedDelegationResult.accepted).toBe(false);
    expect(malformedDelegationResult.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EOM_DELEGATION_ID_INVALID' })]),
    );

    const undefinedPolicy = evaluateAuthority(
      { scope: { origin: 'https://ecme-high.example', paths: ['/'] }, delegations: undefined },
      { ...resource, authority: undefined },
      'https://ecme-high.example/eom/meals.json',
    );
    expect(undefinedPolicy.accepted).toBe(false);
    expect(undefinedPolicy.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EOM_AUTHORITY_DELEGATIONS_INVALID' }),
        expect.objectContaining({ code: 'EOM_AUTHORITY_RESOURCE_AUTHORITY_INVALID' }),
      ]),
    );
  });

  it('rejects invalid injected evaluation times instead of treating temporal policy as absent', () => {
    const resource = delegatedResource(
      'organization-profile',
      'https://ecme-high.example/eom/resource/organization',
    );
    const result = evaluateAuthority(
      { scope: { origin: 'https://ecme-high.example', paths: ['/'] } },
      resource,
      'https://ecme-high.example/eom/organization.json',
      { now: new Date(Number.NaN) },
    );
    expect(result.accepted).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EOM_AUTHORITY_TIME_INVALID' })]),
    );
  });

  it('rejects an explicitly undefined delegation subject instead of treating it as omitted', () => {
    const delegation = {
      ...(fixture('fixtures/delegation/vendor-meals.json') as Record<string, unknown>),
      subject: undefined,
    };
    const result = evaluateAuthority(
      rootManifest(delegation),
      delegatedResource('meal-menu-catalog', 'https://ecme-high.example/eom/resource/meals'),
      'https://menus.vendor.example/customers/ecme-high/meals.json',
      { now: new Date('2027-08-01T00:00:00Z') },
    );
    expect(result.accepted).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EOM_DELEGATION_SUBJECT_INVALID' })]),
    );
  });

  it('rejects a delegated signature whose key is absent from the delegation allowlist', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const resource = delegatedResource(
      'meal-menu-catalog',
      'https://ecme-high.example/eom/resource/meals',
    );
    const keyId = 'https://ecme-high.example/eom/keys#unexpected-key';
    const signature = signDetached(resource, { privateKey, keyId });
    const keySet = { keys: [publicKeyRecord(publicKey, { keyId })] };
    const delegation = {
      type: 'delegation',
      id: 'https://ecme-high.example/id/delegation/meals',
      delegate: 'https://menus.vendor.example/id/organization',
      scope: {
        resourceTypes: ['meal-menu-catalog'],
        resourceIds: ['https://ecme-high.example/eom/resource/meals'],
        allowedOrigins: ['https://menus.vendor.example'],
      },
      keys: ['https://ecme-high.example/eom/keys#approved-key'],
      validFrom: '2027-01-01T00:00:00Z',
      validUntil: '2028-01-01T00:00:00Z',
      transitive: false,
      status: 'active',
      subject: 'https://ecme-high.example/id/school',
    };
    const result = verifyDetached(resource, signature, keySet, {
      now: new Date('2027-08-01T00:00:00Z'),
      manifest: rootManifest(delegation),
      resource,
      finalUrl: 'https://menus.vendor.example/customers/ecme-high/meals.json',
    });
    expect(result.overall).toBe(false);
    expect(result.delegationScopeValid).toBe(false);
  });

  it('fails closed when authority verification is missing transport context or descriptor binding', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const resource = delegatedResource(
      'meal-menu-catalog',
      'https://ecme-high.example/eom/resource/meals',
    ) as Record<string, unknown>;
    const keyId = 'https://ecme-high.example/eom/keys#authority-context';
    const signature = signDetached(resource, { privateKey, keyId });
    const keySet = { keys: [publicKeyRecord(publicKey, { keyId })] };
    const delegation = fixture('fixtures/delegation/vendor-meals.json');
    const manifest = rootManifest(delegation);
    const incomplete = verifyDetached(resource, signature, keySet, {
      manifest,
      resource,
      finalUrl: 'https://menus.vendor.example/customers/ecme-high/meals.json',
    });
    expect(incomplete.overall).toBe(false);
    expect(incomplete.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EOM_AUTHORITY_CONTEXT_REQUIRED' })]),
    );

    const descriptor = {
      id: 'https://ecme-high.example/eom/resource/meals',
      type: 'meal-menu-catalog',
      href: 'https://menus.vendor.example/customers/ecme-high/meals.json',
      subjects: ['https://ecme-high.example/id/school'],
    };
    const tamperedDocument = {
      ...resource,
      id: 'https://ecme-high.example/eom/resource/other-meals',
      canonical: 'https://menus.vendor.example/customers/ecme-high/other.json',
    };
    const tamperedSignature = signDetached(tamperedDocument, { privateKey, keyId });
    const mismatch = verifyDetached(tamperedDocument, tamperedSignature, keySet, {
      now: new Date('2027-08-01T00:00:00Z'),
      manifest,
      authorityResource: descriptor,
      finalUrl: descriptor.href,
      observedRootUrl: 'https://ecme-high.example/.well-known/educational-organization-manifest',
    });
    expect(mismatch.overall).toBe(false);
    expect(mismatch.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EOM_AUTHORITY_DESCRIPTOR_MISMATCH' }),
      ]),
    );

    const descriptorOmitted = verifyDetached(resource, signature, keySet, {
      now: new Date('2027-08-01T00:00:00Z'),
      manifest,
      resource,
      finalUrl: descriptor.href,
      observedRootUrl: 'https://ecme-high.example/.well-known/educational-organization-manifest',
    });
    expect(descriptorOmitted.overall).toBe(false);
    expect(descriptorOmitted.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EOM_AUTHORITY_DESCRIPTOR_REQUIRED' }),
      ]),
    );
  });

  it('evaluates signed delegation against the declared descriptor when the document id differs', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const keyId = 'https://ecme-high.example/eom/keys#organization-profile';
    const descriptor = {
      id: 'https://ecme-high.example/eom/resource/organization-profile',
      type: 'organization-profile',
      href: 'https://directory.vendor.example/ecme/organization.json',
      subjects: ['https://ecme-high.example/id/school'],
      authority: {
        delegation: 'https://ecme-high.example/id/delegation/organization-profile',
      },
    };
    const document = {
      id: 'https://ecme-high.example/id/school',
      type: 'organization-profile',
      canonical: descriptor.href,
      subjects: descriptor.subjects,
      name: 'Ecme High',
    };
    const delegation = {
      type: 'delegation',
      id: 'https://ecme-high.example/id/delegation/organization-profile',
      delegate: 'https://directory.vendor.example/id/organization',
      scope: {
        resourceTypes: ['organization-profile'],
        resourceIds: [descriptor.id],
        allowedOrigins: ['https://directory.vendor.example'],
      },
      keys: [keyId],
      validFrom: '2027-01-01T00:00:00Z',
      validUntil: '2028-01-01T00:00:00Z',
      transitive: false,
      status: 'active',
      subject: 'https://ecme-high.example/id/school',
    };
    const signature = signDetached(document, {
      privateKey,
      keyId,
      createdAt: '2027-08-01T00:00:00Z',
    });
    const result = verifyDetached(
      document,
      signature,
      { keys: [publicKeyRecord(publicKey, { keyId })] },
      {
        now: new Date('2027-08-01T00:00:00Z'),
        manifest: rootManifest(delegation),
        resource: document,
        authorityResource: descriptor,
        finalUrl: descriptor.href,
        observedRootUrl: 'https://ecme-high.example/.well-known/educational-organization-manifest',
      },
    );
    expect(result).toMatchObject({
      overall: true,
      delegationScopeValid: true,
      authority: {
        accepted: true,
        resourceIdInScope: true,
        keyScopeValid: true,
        subjectValid: true,
      },
    });
    const missingDelegation = evaluateAuthority(
      rootManifest(delegation),
      {
        ...descriptor,
        authority: { delegation: 'https://ecme-high.example/id/delegation/missing' },
      },
      descriptor.href,
      { now: new Date('2027-08-01T00:00:00Z') },
    );
    expect(missingDelegation.accepted).toBe(false);
    expect(missingDelegation.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EOM_DELEGATION_REFERENCE_NOT_FOUND' }),
      ]),
    );
  });

  it('rejects a manifest delegation whose subject does not match the resource subject', () => {
    const manifest = fixture('fixtures/valid/core/minimal-school-manifest.json') as Record<
      string,
      unknown
    >;
    manifest.delegations = [
      {
        type: 'delegation',
        id: 'https://ecme-high.example/id/delegation/meals',
        delegate: 'https://menus.vendor.example/id/organization',
        scope: {
          resourceTypes: ['meal-menu-catalog'],
          resourceIds: ['https://ecme-high.example/eom/resource/meals'],
          allowedOrigins: ['https://menus.vendor.example'],
        },
        validFrom: '2027-01-01T00:00:00Z',
        validUntil: '2028-01-01T00:00:00Z',
        transitive: false,
        status: 'active',
        subject: 'https://ecme-high.example/id/other-school',
      },
    ];
    manifest.resources = [
      ...((manifest.resources as unknown[]) ?? []),
      {
        id: 'https://ecme-high.example/eom/resource/meals',
        type: 'meal-menu-catalog',
        href: 'https://menus.vendor.example/customers/ecme-high/meals.json',
        mediaType: 'application/json',
        version: '1.0',
        subjects: ['https://ecme-high.example/id/school'],
        languages: ['en-US'],
      },
    ];
    const result = validateDocument(manifest, { now: new Date('2027-08-01T00:00:00Z') });
    expect(result.valid).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EOM_DELEGATION_SUBJECT_MISMATCH' }),
      ]),
    );
  });

  it('requires a finite delegation validity interval', () => {
    const delegation = fixture('fixtures/delegation/vendor-meals.json') as Record<string, unknown>;
    delete delegation.validUntil;
    const result = validateDocument(delegation, {
      schemaFile: 'delegation.schema.json',
      now: new Date('2127-08-01T00:00:00Z'),
    });
    expect(result.valid).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EOM_SCHEMA_REQUIRED' })]),
    );
  });

  it('rejects calendar-invalid delegation timestamps in direct authority evaluation', () => {
    const delegation = fixture('fixtures/delegation/vendor-meals.json') as Record<string, unknown>;
    const result = evaluateAuthority(
      rootManifest({ ...delegation, validFrom: '2027-02-30T00:00:00Z' }),
      delegatedResource('meal-menu-catalog', 'https://ecme-high.example/eom/resource/meals'),
      'https://menus.vendor.example/customers/ecme-high/meals.json',
      { now: new Date('2027-08-01T00:00:00Z') },
    );
    expect(result.accepted).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EOM_DELEGATION_DATE_INVALID' })]),
    );
  });

  it('requires the delegation record type before authority evaluation can accept it', () => {
    const delegation = fixture('fixtures/delegation/vendor-meals.json') as Record<string, unknown>;
    delete delegation.type;
    const result = validateDocument(delegation, {
      schemaFile: 'delegation.schema.json',
      now: new Date('2027-08-01T00:00:00Z'),
    });
    expect(result.valid).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EOM_SCHEMA_REQUIRED' })]),
    );
    const authority = evaluateAuthority(
      rootManifest(delegation),
      delegatedResource('meal-menu-catalog', 'https://ecme-high.example/eom/resource/meals'),
      'https://menus.vendor.example/customers/ecme-high/meals.json',
      { now: new Date('2027-08-01T00:00:00Z') },
    );
    expect(authority.accepted).toBe(false);
    expect(authority.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EOM_DELEGATION_TYPE_INVALID' })]),
    );
  });

  it('does not treat inherited manifest policy as declared authority', () => {
    const inheritedManifest = Object.create({
      scope: { origin: 'https://ecme-high.example', paths: ['/'] },
    }) as Record<string, unknown>;
    const resource = delegatedResource(
      'meal-menu-catalog',
      'https://ecme-high.example/eom/resource/meals',
    );
    const result = evaluateAuthority(
      inheritedManifest,
      resource,
      'https://ecme-high.example/eom/meals.json',
    );
    expect(result.accepted).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EOM_AUTHORITY_ROOT_ORIGIN_INVALID' }),
      ]),
    );
  });
});

describe('EOM optional JCS and detached Ed25519 signatures', () => {
  it('verifies the committed public-only detached signature vector', () => {
    const resource = fixture('fixtures/signatures/unsigned-resource.json');
    const keySet = fixture('fixtures/signatures/key-set.json');
    const signature = fixture('fixtures/signatures/static-vector.json');
    expect(validateDocument(keySet).valid).toBe(true);
    expect(validateDocument(signature).valid).toBe(true);
    expect(
      verifyDetached(resource, signature, keySet, {
        now: new Date('2027-08-01T00:00:00Z'),
      }).overall,
    ).toBe(true);
  });

  it('rejects a signed resource with malformed expiry metadata', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const resource = {
      ...(fixture('fixtures/signatures/unsigned-resource.json') as Record<string, unknown>),
      expires: 123,
    };
    const keyId = 'https://ecme-high.example/eom/keys#malformed-expiry';
    const signature = signDetached(resource, { privateKey, keyId });
    const keySet = { keys: [publicKeyRecord(publicKey, { keyId })] };
    const result = verifyDetached(resource, signature, keySet, {
      now: new Date('2027-08-01T00:00:00Z'),
    });
    expect(result.resourceExpiryValid).toBe(false);
    expect(result.overall).toBe(false);
  });

  it('rejects a signing subject that does not match the resource id', () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const resource = fixture('fixtures/signatures/unsigned-resource.json');
    let thrown: unknown;
    try {
      signDetached(resource, {
        privateKey,
        keyId: 'https://ecme-high.example/eom/keys#subject-mismatch',
        subject: 'https://ecme-high.example/eom/other-resource',
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: 'EOM_SIGNATURE_SUBJECT_MISMATCH' });
  });

  it('rejects invalid signature identifiers and canonical URLs at signing time', () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const resource = fixture('fixtures/signatures/unsigned-resource.json');
    const keyId = 'https://ecme-high.example/eom/keys#signing-boundary';
    expect(() =>
      signDetached(resource, {
        privateKey,
        keyId,
        signatureId: 'relative-signature-id',
      }),
    ).toThrow('A detached signature id must be an absolute URI.');
    expect(() =>
      signDetached(resource, {
        privateKey,
        keyId,
        canonical: 'http://ecme-high.example/eom/signatures/resource',
      }),
    ).toThrow('A detached signature canonical value must be an HTTPS URL.');
  });

  it('rejects invalid Date instances with a typed signature policy error', () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const resource = fixture('fixtures/signatures/unsigned-resource.json');
    let thrown: unknown;
    try {
      signDetached(resource, {
        privateKey,
        keyId: 'https://ecme-high.example/eom/keys#invalid-date',
        createdAt: new Date(Number.NaN),
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      name: 'SignaturePolicyError',
      code: 'EOM_SIGNATURE_TIME_INVALID',
    });
  });

  it('rejects calendar-invalid signature timestamps instead of normalizing them', () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const resource = fixture('fixtures/signatures/unsigned-resource.json');
    expect(() =>
      signDetached(resource, {
        privateKey,
        keyId: 'https://ecme-high.example/eom/keys#invalid-calendar-date',
        createdAt: '2027-02-30T00:00:00Z',
      }),
    ).toThrow('Signature creation time is invalid.');
  });

  it('rejects an explicitly undefined expiry property instead of treating it as absent', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const resource = fixture('fixtures/signatures/unsigned-resource.json');
    const keyId = 'https://ecme-high.example/eom/keys#undefined-expiry';
    const signature = signDetached(resource, { privateKey, keyId });
    const malformed = { ...signature, expires: undefined };
    const result = verifyDetached(resource, malformed, {
      keys: [publicKeyRecord(publicKey, { keyId })],
    });
    expect(result.overall).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EOM_SIGNATURE_PROFILE_INVALID' })]),
    );
  });

  it('rejects invalid evaluation times for signed and unsigned verification', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const resource = fixture('fixtures/signatures/unsigned-resource.json');
    const keyId = 'https://ecme-high.example/eom/keys#invalid-verification-time';
    const signature = signDetached(resource, { privateKey, keyId });
    const keySet = { keys: [publicKeyRecord(publicKey, { keyId })] };
    const signed = verifyDetached(resource, signature, keySet, {
      now: new Date(Number.NaN),
    });
    expect(signed.overall).toBe(false);
    expect(signed.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EOM_SIGNATURE_TIME_INVALID' })]),
    );
    expect(verifyUnsigned(resource, { now: new Date(Number.NaN) }).overall).toBe(false);
  });

  it('signs, validates, and verifies a detached resource, including WebCrypto verification', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const resource = fixture('fixtures/signatures/unsigned-resource.json');
    const keyId = 'https://ecme-high.example/eom/keys#signing-2027';
    const signature = signDetached(resource, {
      privateKey,
      keyId,
      createdAt: '2027-08-01T00:00:00Z',
    });
    const keySet = {
      $schema: 'https://paperandslate.org/schemas/eom/1.0/key-set.schema.json',
      specification: 'https://paperandslate.org/spec/eom/1.0',
      version: '1.0',
      id: 'https://ecme-high.example/eom/keys',
      type: 'key-set',
      canonical: 'https://ecme-high.example/eom/keys.json',
      keys: [publicKeyRecord(publicKey, { keyId })],
      expires: '2030-01-01T00:00:00Z',
    };
    expect(validateDocument(keySet).valid).toBe(true);
    expect(validateDocument(signature).valid).toBe(true);
    const result = verifyDetached(resource, signature, keySet, {
      now: new Date('2027-08-01T00:00:00Z'),
    });
    expect(result).toMatchObject({
      canonicalizationValid: true,
      digestMatch: true,
      signatureValid: true,
      keyTemporalValid: true,
      keyRevoked: false,
      overall: true,
    });
    const protectedHeader = JSON.parse(
      decodeBase64Url(signature.protected).toString('utf8'),
    ) as Record<string, unknown>;
    const signingInput = new TextEncoder().encode(
      `${signature.protected}.${canonicalizeJson(resource)}`,
    );
    const publicJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
    const cryptoKey = await webcrypto.subtle.importKey(
      'jwk',
      publicJwk,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    expect(
      await webcrypto.subtle.verify(
        'Ed25519',
        cryptoKey,
        decodeBase64Url(signature.signature),
        signingInput,
      ),
    ).toBe(true);
    expect(protectedHeader.alg).toBe('EdDSA');
  });

  it('keeps whitespace canonical, but rejects changed values, wrong keys, expired keys, and revoked keys', () => {
    expect(canonicalizeJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(canonicalizeJsonText('{ "b": 2, "a": 1 }')).toBe('{"a":1,"b":2}');
    expect(() => canonicalizeJsonText('{"a":1,"a":2}')).toThrow();
    expect(() => canonicalizeJson('\ud800')).toThrow(/surrogate/u);
    const sparse: unknown[] = [];
    sparse.length = 1;
    expect(() => canonicalizeJson(sparse)).toThrow(/Sparse arrays/iu);
    let nested: unknown = 0;
    for (let index = 0; index < 129; index += 1) nested = [nested];
    expect(() => canonicalizeJson(nested)).toThrow(/nesting exceeds the 128-level safety limit/iu);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalizeJson(cyclic)).toThrow(/Only finite JSON values/iu);
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const { publicKey: wrongPublicKey } = generateKeyPairSync('ed25519');
    const resource = fixture('fixtures/signatures/unsigned-resource.json');
    const keyId = 'https://ecme-high.example/eom/keys#signing-2027';
    const signature = signDetached(resource, { privateKey, keyId });
    const validKeySet = {
      keys: [publicKeyRecord(publicKey, { keyId })],
    };
    const wrongKeySet = {
      keys: [publicKeyRecord(wrongPublicKey, { keyId })],
    };
    expect(verifyDetached(resource, signature, validKeySet).overall).toBe(true);
    expect(
      verifyDetached(
        { ...(resource as Record<string, unknown>), name: 'Changed' },
        signature,
        validKeySet,
      ).overall,
    ).toBe(false);
    expect(verifyDetached(resource, signature, wrongKeySet).overall).toBe(false);
    expect(
      verifyDetached(
        resource,
        signature,
        { keys: [publicKeyRecord(publicKey, { keyId, validUntil: '2020-01-01T00:00:00Z' })] },
        { now: new Date('2027-01-01T00:00:00Z') },
      ).keyTemporalValid,
    ).toBe(false);
    expect(
      verifyDetached(resource, signature, {
        keys: [publicKeyRecord(publicKey, { keyId, status: 'revoked' })],
      }).keyRevoked,
    ).toBe(true);
  });

  it('rejects unknown critical headers and keeps unsigned resources valid', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const resource = fixture('fixtures/signatures/unsigned-resource.json');
    const keyId = 'https://ecme-high.example/eom/keys#signing-2027';
    const signature = signDetached(resource, { privateKey, keyId });
    const header = JSON.parse(decodeBase64Url(signature.protected).toString('utf8')) as Record<
      string,
      unknown
    >;
    header.crit = ['b64', 'eom', 'unknown'];
    const protectedValue = encodeBase64Url(Buffer.from(JSON.stringify(header), 'utf8'));
    const tampered = {
      ...signature,
      protected: protectedValue,
      compact: `${protectedValue}..${signature.signature}`,
    };
    const result = verifyDetached(resource, tampered, {
      keys: [publicKeyRecord(publicKey, { keyId })],
    });
    expect(result.overall).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EOM_SIGNATURE_UNKNOWN_CRITICAL' })]),
    );
    expect(verifyUnsigned(resource).overall).toBe(true);
  });

  it('rejects malformed protected encodings without throwing from verification', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const resource = fixture('fixtures/signatures/unsigned-resource.json');
    const keyId = 'https://ecme-high.example/eom/keys#signing-2027';
    const signature = signDetached(resource, { privateKey, keyId });
    const malformed = {
      ...signature,
      protected: 'A',
      compact: `A..${signature.signature}`,
    };
    const result = verifyDetached(resource, malformed, {
      keys: [publicKeyRecord(publicKey, { keyId })],
    });
    expect(result.overall).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'EOM_SIGNATURE_PROTECTED_INVALID' }),
      ]),
    );
  });

  it('does not allow signature expiry to be removed from an otherwise identical record', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const resource = fixture('fixtures/signatures/unsigned-resource.json');
    const keyId = 'https://ecme-high.example/eom/keys#signing-2027';
    const signature = signDetached(resource, {
      privateKey,
      keyId,
      expires: '2028-01-01T00:00:00Z',
    });
    const keySet = { keys: [publicKeyRecord(publicKey, { keyId })] };
    const signed = signature as typeof signature & { readonly expires?: string };
    expect(signed.expires).toBe('2028-01-01T00:00:00.000Z');
    const expired = { ...signature, expires: '2020-01-01T00:00:00Z' };
    expect(
      verifyDetached(resource, expired, keySet, {
        now: new Date('2027-08-01T00:00:00Z'),
      }).overall,
    ).toBe(false);
    const missing = { ...signature } as Record<string, unknown>;
    delete missing.expires;
    expect(
      verifyDetached(resource, missing, keySet, {
        now: new Date('2027-08-01T00:00:00Z'),
      }).overall,
    ).toBe(false);
  });

  it('fails closed for ambiguous or malformed verification key sets', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const resource = fixture('fixtures/signatures/unsigned-resource.json');
    const keyId = 'https://ecme-high.example/eom/keys#duplicate';
    const signature = signDetached(resource, { privateKey, keyId });
    const key = publicKeyRecord(publicKey, { keyId });
    const duplicate = verifyDetached(resource, signature, { keys: [key, key] });
    expect(duplicate.overall).toBe(false);
    expect(duplicate.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EOM_SIGNATURE_KEY_DUPLICATE_ID' })]),
    );
    const malformed = verifyDetached(resource, signature, {
      keys: [{ ...key, status: 'unknown', revokedAt: 'not-a-date' }],
    });
    expect(malformed.overall).toBe(false);
    expect(malformed.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EOM_SIGNATURE_KEY_SET_INVALID' })]),
    );
  });

  it('rejects explicitly undefined key lifecycle fields instead of treating them as absent', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const resource = fixture('fixtures/signatures/unsigned-resource.json');
    const keyId = 'https://ecme-high.example/eom/keys#undefined-key-lifetime';
    const signature = signDetached(resource, { privateKey, keyId });
    const key = {
      ...publicKeyRecord(publicKey, { keyId }),
      validUntil: undefined,
    };
    const result = verifyDetached(resource, signature, { keys: [key] });
    expect(result.overall).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EOM_SIGNATURE_KEY_SET_INVALID' })]),
    );
  });
});

function decodeBase64Url(value: string): Buffer {
  const padded =
    value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function encodeBase64Url(value: Uint8Array): string {
  return Buffer.from(value)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}
