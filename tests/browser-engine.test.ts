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
});
