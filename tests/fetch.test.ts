import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { discoveryUrl, fetchEom, fetchManifest } from '@paperandslate/eom-core';
import { validateDocument, validatePublicationUrl } from '@paperandslate/eom-validator';

describe('EOM hardened HTTP retrieval', () => {
  let server: Server;
  let baseUrl: string;
  const manifest = readFileSync(
    resolve('fixtures/valid/core/minimal-school-manifest.json'),
    'utf8',
  );

  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.url === '/cross-origin-root') {
        response.writeHead(302, { location: 'https://example.com/other-root' }).end();
        return;
      }
      if (request.url === '/redirect') {
        response.writeHead(302, { location: '/final' }).end();
        return;
      }
      if (request.url === '/loop') {
        response.writeHead(302, { location: '/loop' }).end();
        return;
      }
      if (request.url === '/wrong-type') {
        response.writeHead(200, { 'content-type': 'text/html' }).end('<html>not EOM</html>');
        return;
      }
      if (request.url === '/large') {
        response.writeHead(200, { 'content-type': 'application/json' }).end('x'.repeat(256));
        return;
      }
      if (request.url === '/head-large') {
        response
          .writeHead(200, { 'content-type': 'application/json', 'content-length': '256' })
          .end();
        return;
      }
      if (request.url === '/compressed') {
        response
          .writeHead(200, {
            'content-type': 'application/json',
            'content-encoding': 'gzip',
          })
          .end(gzipSync(Buffer.from(manifest, 'utf8')));
        return;
      }
      if (request.url === '/invalid-utf8') {
        response
          .writeHead(200, { 'content-type': 'application/json' })
          .end(Buffer.from([0xc3, 0x28]));
        return;
      }
      if (request.url === '/timeout') {
        return;
      }
      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=60',
      });
      response.end(manifest);
    });
    await new Promise<void>((resolvePromise, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolvePromise());
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Loopback server did not bind.');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolvePromise, reject) =>
      server.close((error) => (error ? reject(error) : resolvePromise())),
    );
  });

  it('normalizes an origin to the canonical discovery path', () => {
    expect(discoveryUrl('school.example')).toBe(
      'https://school.example/.well-known/educational-organization-manifest',
    );
    expect(discoveryUrl('https://school.example/')).toBe(
      'https://school.example/.well-known/educational-organization-manifest',
    );
    expect(discoveryUrl('http://school.example/')).toBe(
      'https://school.example/.well-known/educational-organization-manifest',
    );
  });

  it('rejects private hosts before any request by default', async () => {
    await expect(fetchManifest('https://127.0.0.1')).rejects.toMatchObject({
      code: 'EOM_FETCH_PRIVATE_HOST',
    });
  });

  it('rejects loopback, documentation, and mapped-private IPv6 targets', async () => {
    for (const target of ['https://[::1]', 'https://[2001:db8::1]', 'https://[::ffff:127.0.0.1]']) {
      await expect(fetchManifest(target)).rejects.toMatchObject({
        code: 'EOM_FETCH_PRIVATE_HOST',
      });
    }
  });

  it('retrieves and validates a loopback fixture only with explicit test allowances', async () => {
    const result = await fetchManifest(baseUrl, {
      allowHttp: true,
      allowPrivateHosts: true,
      allowNonStandardPorts: true,
    });
    expect(result.status).toBe(200);
    expect(result.redirects).toHaveLength(0);
    expect(validateDocument(result.document).valid).toBe(true);
  });

  it('rejects an HTTP redirect destination even when local HTTP is enabled for tests', async () => {
    await expect(
      fetchEom(`${baseUrl}/redirect`, {
        allowHttp: true,
        allowPrivateHosts: true,
        allowNonStandardPorts: true,
      }),
    ).rejects.toMatchObject({ code: 'EOM_FETCH_REDIRECT_SCHEME' });
  });

  it('rejects a cross-origin root-manifest redirect before following it', async () => {
    await expect(
      fetchManifest(`${baseUrl}/cross-origin-root`, {
        allowHttp: true,
        allowPrivateHosts: true,
        allowNonStandardPorts: true,
      }),
    ).rejects.toMatchObject({ code: 'EOM_FETCH_REDIRECT_ORIGIN' });
  });

  it('detects redirect loops and enforces content and size limits', async () => {
    const local = {
      allowHttp: true,
      allowPrivateHosts: true,
      allowNonStandardPorts: true,
    } as const;
    await expect(fetchEom(`${baseUrl}/loop`, local)).rejects.toMatchObject({
      code: 'EOM_FETCH_REDIRECT_LOOP',
    });
    await expect(fetchEom(`${baseUrl}/wrong-type`, local)).rejects.toMatchObject({
      code: 'EOM_FETCH_CONTENT_TYPE',
    });
    await expect(fetchEom(`${baseUrl}/large`, { ...local, maxBytes: 32 })).rejects.toMatchObject({
      code: 'EOM_FETCH_TOO_LARGE',
    });
    await expect(
      fetchEom(`${baseUrl}/head-large`, { ...local, method: 'HEAD', maxBytes: 32 }),
    ).rejects.toMatchObject({ code: 'EOM_FETCH_TOO_LARGE' });
    await expect(fetchEom(`${baseUrl}/compressed`, local)).rejects.toMatchObject({
      code: 'EOM_FETCH_CONTENT_ENCODING',
    });
    await expect(fetchEom(`${baseUrl}/invalid-utf8`, local)).rejects.toMatchObject({
      code: 'EOM_FETCH_JSON',
    });
  });

  it('fails immediately with a bounded timeout when a server never responds', async () => {
    await expect(
      fetchEom(`${baseUrl}/timeout`, {
        allowHttp: true,
        allowPrivateHosts: true,
        allowNonStandardPorts: true,
        timeoutMs: 25,
      }),
    ).rejects.toMatchObject({ code: 'EOM_FETCH_TIMEOUT' });
  });

  it('applies the publication maxBytes limit to the root URL request', async () => {
    const result = await validatePublicationUrl(baseUrl, {
      fetchGraph: false,
      maxBytes: 32,
      fetch: {
        allowHttp: true,
        allowPrivateHosts: true,
        allowNonStandardPorts: true,
      },
    });
    expect(result.valid).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EOM_FETCH_TOO_LARGE' })]),
    );
  });

  it('connects to the address returned by the validated resolver', async () => {
    let lookups = 0;
    const result = await fetchManifest(`http://rebind-fixture.invalid:${new URL(baseUrl).port}`, {
      allowHttp: true,
      allowPrivateHosts: true,
      allowNonStandardPorts: true,
      dnsLookup: () => {
        lookups += 1;
        return Promise.resolve([{ address: '127.0.0.1' }]);
      },
    });
    expect(result.status).toBe(200);
    expect(lookups).toBe(1);
  });

  it('bounds DNS resolution with the same request timeout', async () => {
    await expect(
      fetchEom(`http://dns-timeout.invalid:${new URL(baseUrl).port}`, {
        allowHttp: true,
        allowPrivateHosts: true,
        allowNonStandardPorts: true,
        timeoutMs: 25,
        dnsLookup: () => new Promise(() => undefined),
      }),
    ).rejects.toMatchObject({ code: 'EOM_FETCH_TIMEOUT' });
  });

  it('does not trust a tampered cache response as an HTTP success', async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), 'eom-fetch-cache-'));
    try {
      const local = {
        allowHttp: true,
        allowPrivateHosts: true,
        allowNonStandardPorts: true,
        cacheDirectory,
      } as const;
      await fetchManifest(baseUrl, local);
      const cachePathRoot = join(cacheDirectory, 'http');
      const [cacheFile] = await readdir(cachePathRoot);
      if (!cacheFile) throw new Error('The fetch cache did not produce an entry.');
      const cachePath = join(cachePathRoot, cacheFile);
      const cached = JSON.parse(await readFile(cachePath, 'utf8')) as Record<string, unknown>;
      cached.body = manifest.replace('Ecme High School', 'Tampered School');
      await writeFile(cachePath, JSON.stringify(cached), 'utf8');
      const response = await fetchManifest(baseUrl, local);
      expect(response.status).toBe(200);
      expect(response.document).toMatchObject({ type: 'manifest' });
    } finally {
      await rm(cacheDirectory, { recursive: true, force: true });
    }
  });

  it('reports whether a successful response came from the bounded cache', async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), 'eom-fetch-cache-provenance-'));
    try {
      const local = {
        allowHttp: true,
        allowPrivateHosts: true,
        allowNonStandardPorts: true,
        cacheDirectory,
      } as const;
      const first = await fetchManifest(baseUrl, local);
      const second = await fetchManifest(baseUrl, local);
      expect(first.cached).toBe(false);
      expect(second.cached).toBe(true);
    } finally {
      await rm(cacheDirectory, { recursive: true, force: true });
    }
  });

  it('does not admit a serialized cache entry beyond the aggregate byte budget', async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), 'eom-fetch-cache-budget-'));
    try {
      const local = {
        allowHttp: true,
        allowPrivateHosts: true,
        allowNonStandardPorts: true,
        cacheDirectory,
        cacheMaxBytes: 64,
      } as const;
      const first = await fetchManifest(baseUrl, local);
      const second = await fetchManifest(baseUrl, local);
      expect(first.cached).toBe(false);
      expect(second.cached).toBe(false);
    } finally {
      await rm(cacheDirectory, { recursive: true, force: true });
    }
  });

  it('evicts stale cache entries only after stable identity checks', async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), 'eom-fetch-cache-expiry-'));
    try {
      const local = {
        allowHttp: true,
        allowPrivateHosts: true,
        allowNonStandardPorts: true,
        cacheDirectory,
      } as const;
      const expiring = { ...local, cacheMaxAgeMs: 0 } as const;
      const first = await fetchManifest(baseUrl, expiring);
      const second = await fetchManifest(baseUrl, expiring);
      const third = await fetchManifest(baseUrl, local);
      expect(first.cached).toBe(false);
      expect(second.cached).toBe(false);
      expect(third.cached).toBe(true);
    } finally {
      await rm(cacheDirectory, { recursive: true, force: true });
    }
  });

  it('does not create cache directories through a symlink', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-fetch-cache-safety-'));
    const external = await mkdtemp(join(tmpdir(), 'eom-fetch-cache-external-'));
    try {
      const link = join(root, 'linked-cache');
      try {
        await symlink(external, link, 'junction');
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          (error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'EINVAL')
        ) {
          return;
        }
        throw error;
      }
      await fetchEom(`${baseUrl}/manifest`, {
        allowHttp: true,
        allowPrivateHosts: true,
        allowNonStandardPorts: true,
        cacheDirectory: join(link, 'nested'),
      });
      await expect(stat(join(external, 'nested'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(external, { recursive: true, force: true });
    }
  });
});
