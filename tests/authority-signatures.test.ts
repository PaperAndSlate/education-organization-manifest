import { generateKeyPairSync, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateAuthority } from '@paperandslate/eom-authority';
import { parseStrictJson } from '@paperandslate/eom-core';
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
    );
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
