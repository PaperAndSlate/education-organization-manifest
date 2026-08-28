import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { lstat, mkdir, mkdtemp, open, opendir, realpath, rename, rm, stat } from 'node:fs/promises';
import { request as httpRequest, type ClientRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { basename, join, resolve } from 'node:path';
import { isBlockedIp, isPrivateOrLocalHostname } from './ids.js';
import { normalizeFsPath } from './fs-path.js';
import { parseStrictJson, type JsonValue } from './json.js';

export const EOM_DISCOVERY_PATH = '/.well-known/educational-organization-manifest';
export const DEFAULT_FETCH_MAX_BYTES = 10 * 1024 * 1024;
export const DEFAULT_FETCH_MAX_REDIRECTS = 5;
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
export const DEFAULT_FETCH_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
export const DEFAULT_FETCH_CACHE_MAX_ENTRIES = 128;
export const MAX_FETCH_BYTES = 64 * 1024 * 1024;
export const MAX_FETCH_REDIRECTS = 20;
export const MAX_FETCH_TIMEOUT_MS = 120_000;
export const MAX_FETCH_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_FETCH_CACHE_MAX_ENTRIES = 4096;

export type EomFetchErrorCode =
  | 'EOM_FETCH_SCHEME'
  | 'EOM_FETCH_USERINFO'
  | 'EOM_FETCH_PRIVATE_HOST'
  | 'EOM_FETCH_DNS'
  | 'EOM_FETCH_PORT'
  | 'EOM_FETCH_REDIRECT_LIMIT'
  | 'EOM_FETCH_REDIRECT_LOOP'
  | 'EOM_FETCH_REDIRECT_SCHEME'
  | 'EOM_FETCH_REDIRECT_ORIGIN'
  | 'EOM_FETCH_REDIRECT_LOCATION'
  | 'EOM_FETCH_CONTENT_TYPE'
  | 'EOM_FETCH_CONTENT_ENCODING'
  | 'EOM_FETCH_TOO_LARGE'
  | 'EOM_FETCH_TIMEOUT'
  | 'EOM_FETCH_STATUS'
  | 'EOM_FETCH_JSON'
  | 'EOM_FETCH_NETWORK';

export interface FetchOptions {
  readonly method?: 'GET' | 'HEAD';
  readonly maxBytes?: number;
  readonly maxRedirects?: number;
  readonly timeoutMs?: number;
  readonly userAgent?: string;
  readonly signal?: AbortSignal;
  /** Optional bounded disk cache. Cache entries contain only public response bytes and headers. */
  readonly cacheDirectory?: string;
  readonly cacheMaxAgeMs?: number;
  readonly cacheMaxEntries?: number;
  /** Test-only escape hatch for deterministic local HTTP fixtures. */
  readonly allowHttp?: boolean;
  /** Test-only escape hatch for deterministic local HTTP fixtures. */
  readonly allowPrivateHosts?: boolean;
  /** Test-only escape hatch for deterministic local HTTP fixtures. */
  readonly allowNonStandardPorts?: boolean;
  /** Test-only resolver injection used to exercise DNS-rebinding defenses. */
  readonly dnsLookup?: FetchDnsLookup;
  /** Restrict every redirect to the origin of the initial request. */
  readonly sameOriginRedirectsOnly?: boolean;
}

export type FetchDnsLookup = (hostname: string) => Promise<readonly { readonly address: string }[]>;

export interface RedirectHop {
  readonly from: string;
  readonly to: string;
  readonly status: number;
  readonly crossOrigin: boolean;
}

export interface FetchResponse {
  readonly requestedUrl: string;
  readonly finalUrl: string;
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly contentType?: string;
  readonly body: string;
  readonly redirects: readonly RedirectHop[];
  readonly observedAt: string;
  /** Whether this response was served from the bounded HTTP cache. */
  readonly cached?: boolean;
}

export interface ManifestFetchResponse extends FetchResponse {
  readonly document: JsonValue;
}

export class EomFetchError extends Error {
  public constructor(
    public readonly code: EomFetchErrorCode,
    message: string,
    public readonly url?: string,
    public readonly redirects: readonly RedirectHop[] = [],
  ) {
    super(message);
    this.name = 'EomFetchError';
  }
}

export function discoveryUrl(originOrUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(originOrUrl.includes('://') ? originOrUrl : `https://${originOrUrl}`);
  } catch {
    throw new EomFetchError(
      'EOM_FETCH_SCHEME',
      'The discovery input is not a valid URL.',
      originOrUrl,
    );
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new EomFetchError('EOM_FETCH_SCHEME', 'Discovery requires an HTTP(S) URL.', originOrUrl);
  }
  // Discovery is always upgraded before the first request.  An HTTP origin is
  // only an input spelling; it is never allowed to become an HTTP transport.
  parsed.protocol = 'https:';
  if (parsed.username || parsed.password) {
    throw new EomFetchError(
      'EOM_FETCH_USERINFO',
      'Discovery URLs must not contain userinfo.',
      originOrUrl,
    );
  }
  if (parsed.pathname === EOM_DISCOVERY_PATH) return parsed.toString();
  if (parsed.pathname === '/' || parsed.pathname === '') {
    parsed.pathname = EOM_DISCOVERY_PATH;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  }
  return parsed.toString();
}

export async function fetchEom(url: string, options: FetchOptions = {}): Promise<FetchResponse> {
  if (options.signal?.aborted) {
    throw new EomFetchError(
      'EOM_FETCH_TIMEOUT',
      'The EOM request was cancelled before it started.',
      url,
    );
  }
  const requestedUrl = normalizeRequestUrl(url);
  const maxBytes = boundedPositive(
    options.maxBytes ?? DEFAULT_FETCH_MAX_BYTES,
    DEFAULT_FETCH_MAX_BYTES,
    MAX_FETCH_BYTES,
  );
  const maxRedirects = boundedNonNegative(
    options.maxRedirects ?? DEFAULT_FETCH_MAX_REDIRECTS,
    DEFAULT_FETCH_MAX_REDIRECTS,
    MAX_FETCH_REDIRECTS,
  );
  const timeoutMs = boundedPositive(
    options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS,
    DEFAULT_FETCH_TIMEOUT_MS,
    MAX_FETCH_TIMEOUT_MS,
  );
  const cacheKey = cacheKeyFor(requestedUrl, options.method ?? 'GET');
  const redirects: RedirectHop[] = [];
  const visited = new Set<string>([canonicalUrl(requestedUrl)]);
  let current = requestedUrl;

  for (;;) {
    const address = await assertSafeTarget(current, options, redirects, timeoutMs);
    if (current === requestedUrl) {
      const cached = await readCachedResponse(cacheKey, requestedUrl, options, maxBytes);
      if (cached && cached.redirects.length <= maxRedirects) {
        if (
          options.sameOriginRedirectsOnly === true &&
          (cached.redirects.some((hop) => hop.crossOrigin) ||
            new URL(cached.finalUrl).origin !== new URL(requestedUrl).origin)
        ) {
          throw new EomFetchError(
            'EOM_FETCH_REDIRECT_ORIGIN',
            'The redirect chain leaves the initial request origin.',
            cached.finalUrl,
            cached.redirects,
          );
        }
        // Cached responses must still revalidate the current and final DNS answers so the
        // cache cannot bypass the SSRF/rebinding policy.
        await assertSafeTarget(cached.finalUrl, options, redirects, timeoutMs);
        for (const hop of cached.redirects) {
          await assertSafeTarget(hop.from, options, redirects, timeoutMs);
          await assertSafeTarget(hop.to, options, redirects, timeoutMs);
        }
        return {
          ...cached,
          requestedUrl,
          observedAt: new Date().toISOString(),
          cached: true,
        };
      }
    }
    const response = await request(current, address, options, timeoutMs, maxBytes, redirects);
    const location = response.headers.get('location');
    if (isRedirectStatus(response.status)) {
      if (!location) {
        throw new EomFetchError(
          'EOM_FETCH_REDIRECT_LOCATION',
          'A redirect response did not include a Location header.',
          current,
          redirects,
        );
      }
      if (redirects.length >= maxRedirects) {
        throw new EomFetchError(
          'EOM_FETCH_REDIRECT_LIMIT',
          `The redirect limit of ${maxRedirects} was exceeded.`,
          current,
          redirects,
        );
      }
      const next = resolveRedirect(current, location, redirects);
      const key = canonicalUrl(next);
      if (visited.has(key)) {
        throw new EomFetchError(
          'EOM_FETCH_REDIRECT_LOOP',
          'The redirect chain contains a loop.',
          next,
          redirects,
        );
      }
      if (new URL(next).protocol !== 'https:') {
        throw new EomFetchError(
          'EOM_FETCH_REDIRECT_SCHEME',
          'Redirect destinations must use HTTPS.',
          next,
          redirects,
        );
      }
      const redirect: RedirectHop = {
        from: current,
        to: next,
        status: response.status,
        crossOrigin: new URL(current).origin !== new URL(next).origin,
      };
      if (options.sameOriginRedirectsOnly === true && redirect.crossOrigin) {
        throw new EomFetchError(
          'EOM_FETCH_REDIRECT_ORIGIN',
          'The redirect chain leaves the initial request origin.',
          next,
          [...redirects, redirect],
        );
      }
      redirects.push(redirect);
      visited.add(key);
      current = next;
      continue;
    }

    if (response.status !== 200) {
      throw new EomFetchError(
        'EOM_FETCH_STATUS',
        `The EOM endpoint returned HTTP ${response.status}.`,
        current,
        redirects,
      );
    }
    const contentType = response.headers.get('content-type') ?? undefined;
    if (!isJsonContentType(contentType)) {
      throw new EomFetchError(
        'EOM_FETCH_CONTENT_TYPE',
        'A successful EOM response must use application/json or a JSON media type.',
        current,
        redirects,
      );
    }
    const contentEncoding = response.headers.get('content-encoding');
    if (contentEncoding && contentEncoding.toLowerCase() !== 'identity') {
      throw new EomFetchError(
        'EOM_FETCH_CONTENT_ENCODING',
        'Compressed response bodies are not accepted; use identity content encoding or a bounded decompression transport.',
        current,
        redirects,
      );
    }
    const body =
      options.method === 'HEAD'
        ? ''
        : await readBoundedBody(response, maxBytes, current, redirects);
    const result: FetchResponse = {
      requestedUrl,
      finalUrl: current,
      status: response.status,
      headers: headersObject(response.headers),
      ...(contentType ? { contentType } : {}),
      body,
      redirects,
      observedAt: new Date().toISOString(),
      cached: false,
    };
    await writeCachedResponse(cacheKey, result, options);
    return result;
  }
}

export async function fetchManifest(
  originOrUrl: string,
  options: FetchOptions = {},
): Promise<ManifestFetchResponse> {
  const discoveredUrl = discoveryUrl(originOrUrl);
  // Local HTTP fixtures are an explicit test-only exception.  Normal callers
  // always receive the HTTPS-normalized discovery URL above.
  const requestUrl =
    options.allowHttp === true && /^http:\/\//iu.test(originOrUrl)
      ? discoveredUrl.replace(/^https:/iu, 'http:')
      : discoveredUrl;
  const response = await fetchEom(requestUrl, {
    ...options,
    sameOriginRedirectsOnly: true,
  });
  const discoveredOrigin = new URL(requestUrl).origin;
  const rootRedirectCrossesOrigin =
    response.redirects.some((hop) => hop.crossOrigin) ||
    new URL(response.finalUrl).origin !== discoveredOrigin;
  if (rootRedirectCrossesOrigin) {
    throw new EomFetchError(
      'EOM_FETCH_REDIRECT_ORIGIN',
      'The root manifest must remain on the discovered origin until a trusted manifest authorizes another origin.',
      response.finalUrl,
      response.redirects,
    );
  }
  let document: JsonValue;
  try {
    document = parseStrictJson(response.body, response.finalUrl);
  } catch (error) {
    throw new EomFetchError(
      'EOM_FETCH_JSON',
      error instanceof Error ? error.message : 'The EOM response is not valid JSON.',
      response.finalUrl,
      response.redirects,
    );
  }
  return { ...response, document };
}

async function assertSafeTarget(
  value: string,
  options: FetchOptions,
  redirects: readonly RedirectHop[],
  timeoutMs: number,
): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new EomFetchError('EOM_FETCH_SCHEME', 'The request URL is invalid.', value, redirects);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new EomFetchError(
      'EOM_FETCH_SCHEME',
      'Only HTTP(S) URLs may be fetched.',
      value,
      redirects,
    );
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/gu, '');
  if (parsed.username || parsed.password) {
    throw new EomFetchError(
      'EOM_FETCH_USERINFO',
      'Fetched URLs must not contain userinfo.',
      value,
      redirects,
    );
  }
  if (parsed.protocol === 'http:' && options.allowHttp !== true) {
    throw new EomFetchError(
      'EOM_FETCH_SCHEME',
      'HTTPS is required for EOM retrieval.',
      value,
      redirects,
    );
  }
  const defaultPort = parsed.protocol === 'https:' ? '443' : '80';
  if (parsed.port && parsed.port !== defaultPort && options.allowNonStandardPorts !== true) {
    throw new EomFetchError(
      'EOM_FETCH_PORT',
      'Only the default HTTPS/HTTP port is allowed.',
      value,
      redirects,
    );
  }
  if (isPrivateOrLocalHostname(hostname) && options.allowPrivateHosts !== true) {
    throw new EomFetchError(
      'EOM_FETCH_PRIVATE_HOST',
      'Private and local hosts are not fetchable by default.',
      value,
      redirects,
    );
  }
  if (isIP(hostname) !== 0) {
    if (isBlockedIp(hostname) && options.allowPrivateHosts !== true) {
      throw new EomFetchError(
        'EOM_FETCH_PRIVATE_HOST',
        'The target IP is private or reserved.',
        value,
        redirects,
      );
    }
    return hostname;
  }
  let addresses: readonly { address: string }[];
  try {
    addresses = await withTimeout(
      (options.dnsLookup ?? defaultDnsLookup)(hostname),
      timeoutMs,
      options.signal,
      value,
      redirects,
    );
  } catch (error) {
    if (error instanceof EomFetchError) throw error;
    throw new EomFetchError(
      'EOM_FETCH_DNS',
      error instanceof Error ? `DNS lookup failed: ${error.message}` : 'DNS lookup failed.',
      value,
      redirects,
    );
  }
  if (
    options.allowPrivateHosts !== true &&
    addresses.some((address) => isBlockedIp(address.address))
  ) {
    throw new EomFetchError(
      'EOM_FETCH_PRIVATE_HOST',
      'DNS resolved to a private or reserved IP.',
      value,
      redirects,
    );
  }
  const address = addresses[0]?.address;
  if (!address) {
    throw new EomFetchError('EOM_FETCH_DNS', 'DNS returned no addresses.', value, redirects);
  }
  if (isIP(address) === 0) {
    throw new EomFetchError('EOM_FETCH_DNS', 'DNS returned an invalid address.', value, redirects);
  }
  return address;
}

async function request(
  url: string,
  address: string,
  options: FetchOptions,
  timeoutMs: number,
  maxBytes: number,
  redirects: readonly RedirectHop[],
): Promise<Response> {
  const parsed = new URL(url);
  const requestFunction = parsed.protocol === 'https:' ? httpsRequest : httpRequest;
  const body = await new Promise<{ status: number; headers: Headers; body: Buffer }>(
    (resolve, reject) => {
      let settled = false;
      let timedOut = false;
      const chunks: Buffer[] = [];
      let total = 0;
      const state: {
        timer?: ReturnType<typeof setTimeout>;
        abort?: () => void;
        request?: ClientRequest;
      } = {};
      const cleanup = (): void => {
        if (state.timer !== undefined) clearTimeout(state.timer);
        if (state.abort !== undefined) options.signal?.removeEventListener('abort', state.abort);
      };
      const timeoutError = (): EomFetchError =>
        new EomFetchError(
          'EOM_FETCH_TIMEOUT',
          'The EOM request timed out or was cancelled.',
          url,
          redirects,
        );
      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        cleanup();
        state.request?.destroy();
        reject(error);
      };
      const activeRequest = requestFunction(
        {
          protocol: parsed.protocol,
          hostname: address,
          port: parsed.port || undefined,
          path: `${parsed.pathname}${parsed.search}`,
          method: options.method ?? 'GET',
          headers: {
            accept: 'application/json',
            'accept-encoding': 'identity',
            'user-agent': options.userAgent ?? 'paperandslate-eom/1.0.0-rc.3',
            host: parsed.host,
          },
          ...(parsed.protocol === 'https:'
            ? { servername: parsed.hostname, rejectUnauthorized: true }
            : {}),
        },
        (response) => {
          const headers = new Headers();
          for (const [key, value] of Object.entries(response.headers)) {
            if (Array.isArray(value)) headers.set(key, value.join(', '));
            else if (value !== undefined) headers.set(key, value);
          }
          const advertisedLength = response.headers['content-length'];
          if (
            advertisedLength !== undefined &&
            Number.isFinite(Number(advertisedLength)) &&
            Number(advertisedLength) > maxBytes
          ) {
            fail(
              new EomFetchError(
                'EOM_FETCH_TOO_LARGE',
                'The response exceeds the configured byte limit.',
                url,
                redirects,
              ),
            );
            return;
          }
          response.on('data', (chunk: Buffer | string) => {
            if (settled) return;
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            total += buffer.length;
            if (total > maxBytes) {
              fail(
                new EomFetchError(
                  'EOM_FETCH_TOO_LARGE',
                  'The response exceeds the configured byte limit.',
                  url,
                  redirects,
                ),
              );
              return;
            }
            if (options.method === 'HEAD') return;
            chunks.push(buffer);
          });
          response.on('end', () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve({
              status: response.statusCode ?? 0,
              headers,
              body: Buffer.concat(chunks),
            });
          });
          response.on('error', (error) => {
            fail(error);
          });
          response.on('aborted', () => {
            fail(new Error('The response was aborted before completion.'));
          });
        },
      );
      state.request = activeRequest;
      state.timer = setTimeout(() => {
        timedOut = true;
        fail(timeoutError());
      }, timeoutMs);
      state.abort = (): void => {
        fail(timeoutError());
      };
      options.signal?.addEventListener('abort', state.abort, { once: true });
      activeRequest.on('error', (error) => {
        if (settled) return;
        fail(timedOut || options.signal?.aborted ? timeoutError() : error);
      });
      activeRequest.on('close', () => {
        if (!settled)
          fail(new Error('The request closed before a complete response was received.'));
      });
      if (options.signal?.aborted) {
        state.abort();
      } else if (!settled) {
        activeRequest.end();
      }
    },
  ).catch((error) => {
    if (error instanceof EomFetchError) throw error;
    throw new EomFetchError(
      'EOM_FETCH_NETWORK',
      error instanceof Error ? error.message : 'The EOM request failed.',
      url,
      redirects,
    );
  });
  return new Response(options.method === 'HEAD' ? null : new Uint8Array(body.body), {
    status: body.status,
    headers: body.headers,
  });
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  url: string,
  redirects: readonly RedirectHop[],
): Promise<T> {
  if (signal?.aborted) {
    throw new EomFetchError(
      'EOM_FETCH_TIMEOUT',
      'The EOM request was cancelled before DNS resolution completed.',
      url,
      redirects,
    );
  }
  return await new Promise<T>((resolvePromise, rejectPromise) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      rejectPromise(
        new EomFetchError(
          'EOM_FETCH_TIMEOUT',
          'The EOM request timed out during DNS resolution.',
          url,
          redirects,
        ),
      );
    }, timeoutMs);
    const abort = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      rejectPromise(
        new EomFetchError(
          'EOM_FETCH_TIMEOUT',
          'The EOM request was cancelled during DNS resolution.',
          url,
          redirects,
        ),
      );
    };
    signal?.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        resolvePromise(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        rejectPromise(error instanceof Error ? error : new Error('DNS resolution failed.'));
      },
    );
  });
}

async function defaultDnsLookup(hostname: string): Promise<readonly { address: string }[]> {
  return lookup(hostname, { all: true, verbatim: true });
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
  url: string,
  redirects: readonly RedirectHop[],
): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (contentLength && Number.isFinite(Number(contentLength)) && Number(contentLength) > maxBytes) {
    throw new EomFetchError(
      'EOM_FETCH_TOO_LARGE',
      'The response exceeds the configured byte limit.',
      url,
      redirects,
    );
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const bytes = chunk.value;
      total += bytes.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new EomFetchError(
          'EOM_FETCH_TOO_LARGE',
          'The response exceeds the configured byte limit.',
          url,
          redirects,
        );
      }
      chunks.push(bytes);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
    );
  } catch (error) {
    throw new EomFetchError(
      'EOM_FETCH_JSON',
      `The response is not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`,
      url,
      redirects,
    );
  }
}

function normalizeRequestUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    throw new EomFetchError('EOM_FETCH_SCHEME', 'The request URL is invalid.', value);
  }
}

function resolveRedirect(
  from: string,
  location: string,
  redirects: readonly RedirectHop[],
): string {
  try {
    const parsed = new URL(location, from);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new EomFetchError(
        'EOM_FETCH_REDIRECT_SCHEME',
        'Redirects may only use HTTP(S).',
        parsed.toString(),
        redirects,
      );
    }
    if (parsed.username || parsed.password) {
      throw new EomFetchError(
        'EOM_FETCH_USERINFO',
        'Redirect URLs must not contain userinfo.',
        parsed.toString(),
        redirects,
      );
    }
    return parsed.toString();
  } catch (error) {
    if (error instanceof EomFetchError) throw error;
    throw new EomFetchError(
      'EOM_FETCH_REDIRECT_LOCATION',
      'The redirect Location is invalid.',
      from,
      redirects,
    );
  }
}

function canonicalUrl(value: string): string {
  const parsed = new URL(value);
  parsed.hash = '';
  return parsed.toString();
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function isJsonContentType(value: string | undefined): boolean {
  if (!value) return false;
  const mediaType = value.split(';', 1)[0]?.trim().toLowerCase();
  return mediaType === 'application/json' || mediaType?.endsWith('+json') === true;
}

function headersObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of headers.entries()) result[key] = value;
  return result;
}

function boundedPositive(value: number, fallback: number, maximum: number): number {
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), maximum) : fallback;
}

function boundedNonNegative(value: number, fallback: number, maximum: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.min(Math.floor(value), maximum) : fallback;
}

async function readCachedResponse(
  key: string,
  requestedUrl: string,
  options: FetchOptions,
  maxBytes: number,
): Promise<FetchResponse | undefined> {
  if (!options.cacheDirectory) return undefined;
  try {
    const directory = httpCacheDirectory(options);
    const stableDirectory = await realpath(directory);
    if (normalizeFsPath(stableDirectory) !== normalizeFsPath(directory)) return undefined;
    const directoryInformation = await lstat(stableDirectory);
    if (!directoryInformation.isDirectory() || directoryInformation.isSymbolicLink())
      return undefined;
    const path = join(stableDirectory, `${key}.json`);
    const information = await stat(path);
    const maxAge = boundedNonNegative(
      options.cacheMaxAgeMs ?? DEFAULT_FETCH_CACHE_MAX_AGE_MS,
      DEFAULT_FETCH_CACHE_MAX_AGE_MS,
      MAX_FETCH_CACHE_MAX_AGE_MS,
    );
    if (Date.now() - information.mtimeMs > maxAge) return undefined;
    const maxCacheBytes = Math.min(16 * 1024 * 1024, Math.max(maxBytes * 4, 1024 * 1024));
    if (information.size > maxCacheBytes) return undefined;
    const parsed = parseStrictJson(
      new TextDecoder('utf-8', { fatal: true }).decode(await readBoundedFile(path, maxCacheBytes)),
      path,
    );
    if (!isRecord(parsed)) return undefined;
    const value = parsed as Partial<FetchResponse> & { cacheIntegrity?: unknown };
    const allowedFields = new Set([
      'requestedUrl',
      'finalUrl',
      'status',
      'headers',
      'contentType',
      'body',
      'redirects',
      'observedAt',
      'cacheIntegrity',
    ]);
    if (Object.keys(value).some((field) => !allowedFields.has(field))) return undefined;
    const headers = value.headers;
    const contentType =
      typeof value.contentType === 'string'
        ? value.contentType
        : isRecordOfStrings(headers)
          ? headers['content-type']
          : undefined;
    if (
      (value.contentType !== undefined && typeof value.contentType !== 'string') ||
      typeof value.status !== 'number' ||
      !isRedirectChainValid(value.requestedUrl, value.finalUrl, value.redirects)
    ) {
      return undefined;
    }
    if (
      typeof value.requestedUrl !== 'string' ||
      canonicalUrl(value.requestedUrl) !== canonicalUrl(requestedUrl) ||
      typeof value.finalUrl !== 'string' ||
      value.status !== 200 ||
      typeof value.body !== 'string' ||
      Buffer.byteLength(value.body, 'utf8') > maxBytes ||
      !isRecordOfStrings(headers) ||
      !isJsonContentType(headers['content-type']) ||
      !isJsonContentType(contentType) ||
      (typeof contentType === 'string' &&
        typeof headers['content-type'] === 'string' &&
        contentType !== headers['content-type']) ||
      (typeof headers['content-encoding'] === 'string' &&
        headers['content-encoding'].toLowerCase() !== 'identity') ||
      !Array.isArray(value.redirects) ||
      value.redirects.some((hop) => !isRedirectHop(hop)) ||
      typeof value.observedAt !== 'string' ||
      value.cacheIntegrity !==
        cacheIntegrityFor({
          requestedUrl: value.requestedUrl,
          finalUrl: value.finalUrl,
          status: value.status,
          headers,
          ...(typeof value.contentType === 'string' ? { contentType: value.contentType } : {}),
          body: value.body,
          redirects: value.redirects,
          observedAt: value.observedAt,
        })
    ) {
      return undefined;
    }
    const { cacheIntegrity: _cacheIntegrity, cached: _cached, ...cachedResponse } = value;
    return { ...(cachedResponse as FetchResponse), cached: true };
  } catch {
    return undefined;
  }
}

async function readBoundedFile(path: string, maxBytes: number): Promise<Buffer> {
  const linkInformation = await lstat(path);
  if (!linkInformation.isFile() || linkInformation.isSymbolicLink()) {
    throw new Error('cache entry is not a regular file');
  }
  const expectedRealPath = await realpath(path);
  if (normalizeFsPath(expectedRealPath) !== normalizeFsPath(path)) {
    throw new Error('cache entry traverses a symbolic link');
  }
  const handle = await open(path, 'r');
  try {
    const information = await handle.stat();
    const identityChanged =
      linkInformation.dev !== 0 &&
      linkInformation.ino !== 0 &&
      information.dev !== 0 &&
      information.ino !== 0 &&
      (information.dev !== linkInformation.dev || information.ino !== linkInformation.ino);
    if (!information.isFile() || information.size > maxBytes || identityChanged)
      throw new Error('cache entry is not a stable regular file within the byte limit');
    const currentRealPath = await realpath(path);
    if (
      normalizeFsPath(currentRealPath) !== normalizeFsPath(expectedRealPath) ||
      normalizeFsPath(currentRealPath) !== normalizeFsPath(path)
    ) {
      throw new Error('cache entry changed its filesystem identity');
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes - total + 1));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      chunks.push(chunk.subarray(0, bytesRead));
      if (total > maxBytes) throw new Error('cache entry too large');
    }
    return Buffer.concat(chunks, total);
  } finally {
    await handle.close();
  }
}

async function writeCachedResponse(
  key: string,
  response: FetchResponse,
  options: FetchOptions,
): Promise<void> {
  if (!options.cacheDirectory) return;
  let temporaryDirectory: string | undefined;
  let stableDirectory: string | undefined;
  try {
    const directory = httpCacheDirectory(options);
    // Cache writes are an optimization and must never use recursive mkdir on
    // a path that traverses a symlink/junction. Create missing components one
    // at a time beneath a verified real directory and fail closed otherwise.
    const resolvedDirectory = await ensureStableCacheDirectory(directory);
    stableDirectory = resolvedDirectory;
    if (resolvedDirectory === undefined) return;
    const maxEntries = boundedPositive(
      options.cacheMaxEntries ?? DEFAULT_FETCH_CACHE_MAX_ENTRIES,
      DEFAULT_FETCH_CACHE_MAX_ENTRIES,
      MAX_FETCH_CACHE_MAX_ENTRIES,
    );
    const entries = await boundedCacheEntries(resolvedDirectory);
    if (entries === undefined) return;
    const path = join(resolvedDirectory, `${key}.json`);
    // Cache eviction is deliberately non-destructive.  Once the bounded
    // cache is full, skip new keys rather than deleting paths that may have
    // changed identity between enumeration and removal.
    if (entries.length >= maxEntries && !entries.includes(path)) return;
    if (!(await isStableCacheDirectory(resolvedDirectory))) return;
    temporaryDirectory = await mkdtemp(join(resolvedDirectory, '.eom-cache-'));
    const temporary = join(temporaryDirectory, `${key}.json`);
    const temporaryHandle = await open(temporary, 'wx');
    try {
      // Cache provenance is transport metadata, not part of the cached
      // representation. A network response is written as cacheable content;
      // the next read marks it as cached explicitly.
      const { cached: _cached, ...cacheableResponse } = response;
      await temporaryHandle.writeFile(
        JSON.stringify({
          ...cacheableResponse,
          cacheIntegrity: cacheIntegrityFor(response),
        }),
        'utf8',
      );
    } finally {
      await temporaryHandle.close();
    }
    if (!(await isStableCacheDirectory(resolvedDirectory))) return;
    await rename(temporary, path);
  } catch {
    // A cache is an optimization. Network retrieval remains authoritative when it cannot be written.
  } finally {
    if (temporaryDirectory && stableDirectory && (await isStableCacheDirectory(stableDirectory))) {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

async function boundedCacheEntries(directory: string): Promise<string[] | undefined> {
  const handle = await opendir(directory);
  const entries: string[] = [];
  let count = 0;
  try {
    for await (const entry of handle) {
      count += 1;
      if (count > MAX_FETCH_CACHE_MAX_ENTRIES) return undefined;
      if (entry.isFile() && /^[a-f0-9]{64}\.json$/u.test(entry.name)) {
        entries.push(join(directory, entry.name));
      }
    }
    return entries;
  } finally {
    await handle.close().catch(() => undefined);
  }
}

async function isStableCacheDirectory(directory: string): Promise<boolean> {
  try {
    const information = await lstat(directory);
    return (
      information.isDirectory() &&
      !information.isSymbolicLink() &&
      normalizeFsPath(await realpath(directory)) === normalizeFsPath(directory)
    );
  } catch {
    return false;
  }
}

function httpCacheDirectory(options: FetchOptions): string {
  if (!options.cacheDirectory) throw new Error('An HTTP cache directory is required.');
  return join(resolve(options.cacheDirectory), 'http');
}

async function ensureStableCacheDirectory(path: string): Promise<string | undefined> {
  const resolved = resolve(path);
  const missing: string[] = [];
  let current = resolved;
  let stable: string | undefined;

  for (;;) {
    try {
      const information = await lstat(current);
      if (!information.isDirectory() || information.isSymbolicLink()) return undefined;
      stable = await realpath(current);
      if (normalizeFsPath(stable) !== normalizeFsPath(current)) return undefined;
      break;
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      const parent = resolve(current, '..');
      if (parent === current) return undefined;
      missing.push(current);
      current = parent;
    }
  }

  for (const missingPath of missing.reverse()) {
    const child = join(stable, basename(missingPath));
    try {
      await mkdir(child);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
    }
    const information = await lstat(child);
    if (!information.isDirectory() || information.isSymbolicLink()) return undefined;
    const actual = await realpath(child);
    if (normalizeFsPath(actual) !== normalizeFsPath(child)) return undefined;
    stable = actual;
  }
  return stable;
}

function cacheKeyFor(url: string, method: string): string {
  return createHash('sha256').update(`${method}\0${url}`).digest('hex');
}

function cacheIntegrityFor(response: FetchResponse): string {
  const payload = JSON.stringify({
    requestedUrl: response.requestedUrl,
    finalUrl: response.finalUrl,
    status: response.status,
    headers: response.headers,
    ...(response.contentType === undefined ? {} : { contentType: response.contentType }),
    body: response.body,
    redirects: response.redirects,
    observedAt: response.observedAt,
  });
  return `sha256:${createHash('sha256').update(payload, 'utf8').digest('hex')}`;
}

function isRecordOfStrings(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

function isRedirectHop(value: unknown): value is RedirectHop {
  return (
    isRecord(value) &&
    typeof value.from === 'string' &&
    typeof value.to === 'string' &&
    typeof value.status === 'number' &&
    typeof value.crossOrigin === 'boolean'
  );
}

function isRedirectChainValid(
  requestedUrl: unknown,
  finalUrl: unknown,
  redirects: unknown,
): redirects is readonly RedirectHop[] {
  if (
    typeof requestedUrl !== 'string' ||
    typeof finalUrl !== 'string' ||
    !Array.isArray(redirects) ||
    !redirects.every((hop) => isRedirectHop(hop))
  ) {
    return false;
  }
  try {
    let current = canonicalUrl(requestedUrl);
    const visited = new Set([current]);
    for (const hop of redirects) {
      if (canonicalUrl(hop.from) !== current || !isRedirectStatus(hop.status)) return false;
      const from = new URL(hop.from);
      const to = new URL(hop.to);
      if (
        !['http:', 'https:'].includes(from.protocol) ||
        !['http:', 'https:'].includes(to.protocol) ||
        from.username ||
        from.password ||
        to.username ||
        to.password ||
        hop.crossOrigin !== (from.origin !== to.origin)
      ) {
        return false;
      }
      current = canonicalUrl(hop.to);
      if (visited.has(current)) return false;
      visited.add(current);
    }
    return current === canonicalUrl(finalUrl);
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
