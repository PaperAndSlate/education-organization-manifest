import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { generateKeyPairSync } from 'node:crypto';
import { publicKeyRecord, signDetached } from '@paperandslate/eom-signatures';

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
      ) => Promise<{ overall: boolean; findings: readonly string[] }>;
    };
    return playground.verifyDetachedSignature(resource, signature, keySet, {
      now: '2027-01-02T00:00:00Z',
    });
  }, serialized);
  expect(result).toEqual({ overall: true, findings: [] });
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
