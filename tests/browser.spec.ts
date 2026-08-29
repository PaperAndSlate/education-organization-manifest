import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { generateKeyPairSync, sign as signBytes } from 'node:crypto';
import { canonicalizeJson, publicKeyRecord, signDetached } from '@paperandslate/eom-signatures';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page).toHaveTitle('EOM local playground');
});

test('validates the fictional fixture and exposes the bundled schema browser', async ({ page }) => {
  await page.getByRole('button', { name: 'Load fictional fixture' }).click();
  await expect(page.locator('#validation-status')).toContainText(
    'Valid under the bundled EOM schema engine',
  );

  await page.getByRole('button', { name: 'Schema browser' }).click();
  await expect(page.locator('#explore-output')).toContainText('Bundled schema browser');
  await expect(page.locator('#explore-output li')).not.toHaveCount(0);
});

test('verifies a real detached Ed25519 signature in the browser engine', async ({ page }) => {
  const resource = {
    $schema: 'https://paperandslate.org/schemas/eom/1.0/organization-profile.schema.json',
    specification: 'https://paperandslate.org/spec/eom/1.0',
    version: '1.0',
    id: 'https://browser-signature.example/id/organization',
    type: 'organization-profile',
    canonical: 'https://browser-signature.example/eom/organization.json',
    name: 'Browser Signature School',
    organizationType: 'secondary-school',
  };
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const keyId = 'https://browser-signature.example/eom/keys#test-2027';
  const signature = signDetached(resource, {
    privateKey,
    keyId,
    createdAt: '2027-01-01T00:00:00Z',
  });
  const keySet = {
    keys: [publicKeyRecord(publicKey, { keyId })],
  };
  const serialized = JSON.stringify({ resource, signature, keySet });
  const result = await page.evaluate(async (input) => {
    const { resource, signature, keySet } = JSON.parse(input) as {
      resource: unknown;
      signature: unknown;
      keySet: unknown;
    };
    const playground = (window as unknown as { __EOM_PLAYGROUND__: unknown })
      .__EOM_PLAYGROUND__ as {
      verifyDetachedSignature: (
        value: unknown,
        detachedSignature: unknown,
        detachedKeySet: unknown,
        options?: { now?: string },
      ) => Promise<{
        overall: boolean;
        findings: readonly string[];
        keyScopeValid: boolean;
      }>;
    };
    return playground.verifyDetachedSignature(resource, signature, keySet, {
      now: '2027-01-02T00:00:00Z',
    });
  }, serialized);
  expect(result).toEqual({ overall: true, findings: [], keyScopeValid: true });
});

test('rejects invalid UTF-8 and oversized protected headers in the browser verifier', async ({
  page,
}) => {
  const resource = {
    $schema: 'https://paperandslate.org/schemas/eom/1.0/organization-profile.schema.json',
    specification: 'https://paperandslate.org/spec/eom/1.0',
    version: '1.0',
    id: 'https://browser-signature-bytes.example/id/organization',
    type: 'organization-profile',
    canonical: 'https://browser-signature-bytes.example/eom/organization.json',
    name: 'Browser Byte Safety School',
    organizationType: 'secondary-school',
  };
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const keyId = 'https://browser-signature-bytes.example/eom/keys#test-2027';
  const validSignature = signDetached(resource, {
    privateKey,
    keyId,
    createdAt: '2027-01-01T00:00:00Z',
  });
  const validHeader = JSON.parse(
    Buffer.from(validSignature.protected, 'base64url').toString('utf8'),
  ) as Record<string, unknown>;
  const headerText = JSON.stringify({ ...validHeader, diagnostic: 'x' });
  const invalidHeader = Buffer.from(headerText, 'utf8');
  const marker = Buffer.from('"x"', 'utf8');
  const markerOffset = invalidHeader.lastIndexOf(marker);
  expect(markerOffset).toBeGreaterThanOrEqual(0);
  invalidHeader[markerOffset + 1] = 0xff;
  const protectedValue = invalidHeader.toString('base64url');
  const signatureValue = signBytes(
    null,
    Buffer.from(`${protectedValue}.${canonicalizeJson(resource)}`, 'utf8'),
    privateKey,
  ).toString('base64url');
  const keySet = { keys: [publicKeyRecord(publicKey, { keyId })] };
  const browserPayload = {
    resource,
    signature: {
      ...validSignature,
      protected: protectedValue,
      signature: signatureValue,
      compact: `${protectedValue}..${signatureValue}`,
    },
    keySet,
  };
  const invalidUtf8Result = await page.evaluate(async (serialized) => {
    const { resource, signature, keySet } = JSON.parse(serialized) as {
      resource: unknown;
      signature: unknown;
      keySet: unknown;
    };
    const playground = (window as unknown as { __EOM_PLAYGROUND__: unknown })
      .__EOM_PLAYGROUND__ as {
      verifyDetachedSignature: (
        value: unknown,
        detachedSignature: unknown,
        detachedKeySet: unknown,
        options?: { now?: string },
      ) => Promise<{ overall: boolean; findings: readonly string[] }>;
    };
    return playground.verifyDetachedSignature(resource, signature, keySet, {
      now: '2027-01-02T00:00:00Z',
    });
  }, JSON.stringify(browserPayload));
  expect(invalidUtf8Result.overall).toBe(false);
  expect(invalidUtf8Result.findings.join(' ')).toContain('not valid UTF-8');

  const oversizedProtectedValue = 'A'.repeat(100_000);
  const oversizedResult = await page.evaluate(
    async (serialized) => {
      const { resource, signature, keySet } = JSON.parse(serialized) as {
        resource: unknown;
        signature: unknown;
        keySet: unknown;
      };
      const playground = (window as unknown as { __EOM_PLAYGROUND__: unknown })
        .__EOM_PLAYGROUND__ as {
        verifyDetachedSignature: (
          value: unknown,
          detachedSignature: unknown,
          detachedKeySet: unknown,
          options?: { now?: string },
        ) => Promise<{ overall: boolean; findings: readonly string[] }>;
      };
      return playground.verifyDetachedSignature(resource, signature, keySet, {
        now: '2027-01-02T00:00:00Z',
      });
    },
    JSON.stringify({
      resource,
      signature: {
        ...validSignature,
        protected: oversizedProtectedValue,
        compact: `${oversizedProtectedValue}..${validSignature.signature}`,
      },
      keySet,
    }),
  );
  expect(oversizedResult.overall).toBe(false);
  expect(oversizedResult.findings.join(' ')).toContain('64 KiB safety limit');
});

test('rejects detached signature lifetime removal in the browser engine', async ({ page }) => {
  const resource = {
    $schema: 'https://paperandslate.org/schemas/eom/1.0/organization-profile.schema.json',
    specification: 'https://paperandslate.org/spec/eom/1.0',
    version: '1.0',
    id: 'https://browser-signature-expiry.example/id/organization',
    type: 'organization-profile',
    canonical: 'https://browser-signature-expiry.example/eom/organization.json',
    name: 'Browser Expiry School',
    organizationType: 'secondary-school',
  };
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const keyId = 'https://browser-signature-expiry.example/eom/keys#test-2027';
  const signature = signDetached(resource, {
    privateKey,
    keyId,
    createdAt: '2027-01-01T00:00:00Z',
    expires: '2030-01-01T00:00:00Z',
  });
  const keySet = { keys: [publicKeyRecord(publicKey, { keyId })] };
  const browserPayload = JSON.parse(JSON.stringify({ resource, signature, keySet })) as {
    resource: Record<string, unknown>;
    signature: Record<string, unknown>;
    keySet: Record<string, unknown>;
  };
  const result = await page.evaluate(async ({ resource, signature, keySet }) => {
    const playground = (window as unknown as { __EOM_PLAYGROUND__: unknown })
      .__EOM_PLAYGROUND__ as {
      verifyDetachedSignature: (
        value: unknown,
        detachedSignature: unknown,
        detachedKeySet: unknown,
        options?: { now?: string },
      ) => Promise<{ overall: boolean; findings: readonly string[] }>;
    };
    const missingExpiry = { ...signature } as Record<string, unknown>;
    delete missingExpiry.expires;
    return playground.verifyDetachedSignature(resource, missingExpiry, keySet, {
      now: '2027-01-02T00:00:00Z',
    });
  }, browserPayload);
  expect(result.overall).toBe(false);
  expect(result.findings.join(' ')).toContain('lifetime');

  const unknownFieldResult = await page.evaluate(async ({ resource, signature, keySet }) => {
    const playground = (window as unknown as { __EOM_PLAYGROUND__: unknown })
      .__EOM_PLAYGROUND__ as {
      verifyDetachedSignature: (
        value: unknown,
        detachedSignature: unknown,
        detachedKeySet: unknown,
        options?: { now?: string },
      ) => Promise<{ overall: boolean; findings: readonly string[] }>;
    };
    return playground.verifyDetachedSignature(
      resource,
      { ...signature, unsupportedField: true },
      keySet,
      { now: '2027-01-02T00:00:00Z' },
    );
  }, browserPayload);
  expect(unknownFieldResult.overall).toBe(false);
  expect(unknownFieldResult.findings.join(' ')).toContain('additionalProperties');

  const incompleteKeySet = structuredClone(keySet) as {
    keys: Array<Record<string, unknown>>;
  };
  delete incompleteKeySet.keys[0]?.status;
  const missingStatusResult = await page.evaluate(
    async ({ resource, signature, keySet }) => {
      const playground = (window as unknown as { __EOM_PLAYGROUND__: unknown })
        .__EOM_PLAYGROUND__ as {
        verifyDetachedSignature: (
          value: unknown,
          detachedSignature: unknown,
          detachedKeySet: unknown,
          options?: { now?: string },
        ) => Promise<{ overall: boolean; findings: readonly string[] }>;
      };
      return playground.verifyDetachedSignature(resource, signature, keySet, {
        now: '2027-01-02T00:00:00Z',
      });
    },
    { ...browserPayload, keySet: incompleteKeySet },
  );
  expect(missingStatusResult.overall).toBe(false);
  expect(missingStatusResult.findings.join(' ')).toContain('status');

  const expiredResource: Record<string, unknown> = {
    ...resource,
    expires: '2026-01-01T00:00:00Z',
  };
  const expiredResourceSignature = signDetached(expiredResource, {
    privateKey,
    keyId,
    createdAt: '2025-01-01T00:00:00Z',
  });
  const expiredResourceInput: { resource: unknown; signature: unknown; keySet: unknown } = {
    resource: expiredResource,
    signature: expiredResourceSignature,
    keySet,
  };
  const expiredResourceResult = await page.evaluate(
    async (input: { resource: unknown; signature: unknown; keySet: unknown }) => {
      const playground = (window as unknown as { __EOM_PLAYGROUND__: unknown })
        .__EOM_PLAYGROUND__ as {
        verifyDetachedSignature: (
          value: unknown,
          detachedSignature: unknown,
          detachedKeySet: unknown,
          options?: { now?: string },
        ) => Promise<{ overall: boolean; findings: readonly string[] }>;
      };
      return playground.verifyDetachedSignature(input.resource, input.signature, input.keySet, {
        now: '2027-01-02T00:00:00Z',
      });
    },
    expiredResourceInput,
  );
  expect(expiredResourceResult.overall).toBe(false);
  expect(expiredResourceResult.findings.join(' ')).toContain('resource');
});

test('keeps starter and uploaded content as text and rejects cross-origin service paths', async ({
  page,
}) => {
  await page.locator('#starter-name').fill('<img src=x onerror=alert(1)>');
  await page.locator('#starter-origin').fill('https://school.example');
  await page.getByRole('button', { name: 'Generate preview' }).click();
  await expect(page.locator('#starter-output')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#starter-output img')).toHaveCount(0);

  await page.locator('#validation-service').fill('https://evil.example/validate');
  await page.locator('#public-validation-url').fill('https://school.example');
  await page.getByRole('button', { name: 'Run remote validation' }).click();
  await expect(page.locator('#url-validation-status')).toContainText(
    'share the current page origin',
  );

  await page.locator('#file-input').setInputFiles({
    name: 'uploaded.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"type":"not-a-document"}', 'utf8'),
  });
  await expect(page.locator('#validation-status')).toContainText('uploaded.json loaded locally');

  await page.locator('#file-input').setInputFiles({
    name: 'oversized.json',
    mimeType: 'application/json',
    buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 0x61),
  });
  await expect(page.locator('#validation-status')).toContainText(
    'selected file exceeds the 2 MiB safety limit',
  );
  await expect(page.locator('#source')).toHaveValue('');
});

test('bounds same-origin validation service responses', async ({ page }) => {
  await page.route('**/api/eom/validate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: 'a'.repeat(2 * 1024 * 1024 + 1),
    });
  });
  await page.locator('#validation-service').fill('/api/eom/validate');
  await page.locator('#public-validation-url').fill('https://school.example');
  await page.getByRole('button', { name: 'Run remote validation' }).click();
  await expect(page.locator('#url-validation-status')).toContainText(
    'Validation service response exceeds the 2 MiB safety limit.',
  );
});

test('supports keyboard focus, reduced motion, zoom/reflow, and strict CSP', async ({ page }) => {
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.brand')).toBeFocused();

  await page.setViewportSize({ width: 320, height: 720 });
  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll('*')]
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .slice(0, 10)
      .map((element) => ({
        tag: element.tagName,
        id: element.id,
        className: String(element.className),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      })),
  }));
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport + 1);
  await expect(page.locator('body')).toBeVisible();

  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("connect-src 'self'");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test('bounds browser semantic diff inputs before recursive comparison', async ({ page }) => {
  const outcome = await page.evaluate(() => {
    const playground = (window as unknown as { __EOM_PLAYGROUND__: unknown })
      .__EOM_PLAYGROUND__ as {
      semanticDiff: (before: unknown, after: unknown) => unknown;
    };
    const deep: unknown[] = [];
    let cursor = deep;
    for (let index = 0; index < 130; index += 1) {
      const child: unknown[] = [];
      cursor.push(child);
      cursor = child;
    }
    try {
      playground.semanticDiff(deep, deep);
      return 'accepted';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
  expect(outcome).toContain('nesting limit');
});
