import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import {
  semanticDiffBrowser,
  validateBrowserDocument,
  verifyDetachedBrowser,
} from '../apps/playground/src/browser-engine.js';
import { publicKeyRecord, signDetached } from '@paperandslate/eom-signatures';

describe('browser-compatible EOM engine', () => {
  it('rejects sparse runtime arrays before semantic comparison', () => {
    const sparse: unknown[] = [];
    sparse.length = 1;
    expect(() => semanticDiffBrowser(sparse, [])).toThrow(/Sparse arrays/iu);
  });

  it('bounds runtime JSON node traversal', () => {
    expect(() =>
      semanticDiffBrowser(
        Array.from({ length: 100_001 }, () => 0),
        [],
      ),
    ).toThrow(/node safety limit/iu);
  });

  it('rejects sparse runtime values before invoking the bundled validator', () => {
    const sparse: unknown[] = [];
    sparse.length = 1;
    const result = validateBrowserDocument({ type: 'organization-profile', items: sparse });
    expect(result.valid).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: 'EOM_DOCUMENT_JSON_REQUIRED' }),
    );
  });

  it('rejects invalid browser evaluation times instead of using the current clock', () => {
    const result = validateBrowserDocument(
      {
        type: 'organization-profile',
        id: 'https://browser-engine.example/id/organization',
        canonical: 'https://browser-engine.example/eom/organization.json',
      },
      { now: '' },
    );
    expect(result.valid).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: 'EOM_EVALUATION_TIME_INVALID' }),
    );
  });

  it('rejects invalid browser signature evaluation times', async () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const resource = {
      id: 'https://browser-engine.example/id/resource',
      type: 'organization-profile',
      canonical: 'https://browser-engine.example/eom/resource.json',
    };
    const signature = signDetached(resource, {
      privateKey,
      keyId: 'https://browser-engine.example/eom/keys#test',
    });
    const result = await verifyDetachedBrowser(resource, signature, {}, { now: '' });
    expect(result.overall).toBe(false);
    expect(result.findings).toContain('The verification time is invalid.');
  });

  it('normalizes browser values before schema and semantic evaluation', () => {
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'expires');
    Object.defineProperty(Object.prototype, 'expires', {
      configurable: true,
      enumerable: false,
      value: '2020-01-01T00:00:00Z',
      writable: true,
    });
    try {
      const result = validateBrowserDocument(
        {
          type: 'organization-profile',
          id: 'https://browser-engine.example/id/organization',
          canonical: 'https://browser-engine.example/eom/organization.json',
        },
        { now: '2026-01-01T00:00:00Z' },
      );
      expect(result.findings.some((item) => item.code === 'EOM_PUBLICATION_EXPIRED')).toBe(false);
    } finally {
      if (previous) Object.defineProperty(Object.prototype, 'expires', previous);
      else Reflect.deleteProperty(Object.prototype, 'expires');
    }
  });

  it('does not accept inherited signature key metadata', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const resource = {
      id: 'https://browser-engine.example/id/resource',
      type: 'organization-profile',
      canonical: 'https://browser-engine.example/eom/resource.json',
    };
    const keyId = 'https://browser-engine.example/eom/keys#test';
    const signature = signDetached(resource, { privateKey, keyId });
    const key = publicKeyRecord(publicKey, { keyId });
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'keys');
    Object.defineProperty(Object.prototype, 'keys', {
      configurable: true,
      enumerable: false,
      value: [key],
      writable: true,
    });
    try {
      const result = await verifyDetachedBrowser(resource, signature, {});
      expect(result.overall).toBe(false);
      expect(result.findings.join(' ')).toContain('keys');
    } finally {
      if (previous) Object.defineProperty(Object.prototype, 'keys', previous);
      else Reflect.deleteProperty(Object.prototype, 'keys');
    }
  });

  it('binds browser signature key sets to an authority manifest declaration', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const resource = {
      id: 'https://browser-engine.example/id/resource',
      type: 'organization-profile',
      canonical: 'https://browser-engine.example/eom/resource.json',
    };
    const keyId = 'https://browser-engine.example/eom/keys#manifest-binding';
    const keySetId = 'https://browser-engine.example/eom/keys';
    const signature = signDetached(resource, { privateKey, keyId });
    const keySet = {
      $schema: 'https://paperandslate.org/schemas/eom/1.0/key-set.schema.json',
      specification: 'https://paperandslate.org/spec/eom/1.0',
      version: '1.0',
      id: keySetId,
      type: 'key-set',
      canonical: 'https://browser-engine.example/eom/keys.json',
      keys: [publicKeyRecord(publicKey, { keyId })],
    };
    const manifest = { signing: { keySet: keySetId } };
    const matching = await verifyDetachedBrowser(resource, signature, keySet, { manifest });
    expect(matching.findings.join(' ')).not.toContain('MANIFEST_KEY_SET_MISMATCH');

    const mismatched = await verifyDetachedBrowser(
      resource,
      signature,
      { ...keySet, id: 'https://browser-engine.example/eom/other-keys' },
      { manifest },
    );
    expect(mismatched.overall).toBe(false);
    expect(mismatched.findings.join(' ')).toContain('EOM_SIGNATURE_MANIFEST_KEY_SET_MISMATCH');
  });
});
