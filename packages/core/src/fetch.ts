import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { join, resolve } from 'node:path';
import { isPrivateOrLocalHostname } from './ids.js';
import { parseStrictJson, type JsonValue } from './json.js';

export const EOM_DISCOVERY_PATH = '/.well-known/educational-organization-manifest';
export const DEFAULT_FETCH_MAX_BYTES = 10 * 1024 * 1024;
export const DEFAULT_FETCH_MAX_REDIRECTS = 5;
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
export const DEFAULT_FETCH_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
export const DEFAULT_FETCH_CACHE_MAX_ENTRIES = 128;

export type EomFetchErrorCode =
  | 'EOM_FETCH_SCHEME'
  | 'EOM_FETCH_USERINFO'
  | 'EOM_FETCH_PRIVATE_HOST'
  | 'EOM_FETCH_DNS'
  | 'EOM_FETCH_PORT'
  | 'EOM_FETCH_REDIRECT_LIMIT'
  | 'EOM_FETCH_REDIRECT_LOOP'
  | 'EOM_FETCH_REDIRECT_SCHEME'
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
  );
  const maxRedirects = boundedNonNegative(
    options.maxRedirects ?? DEFAULT_FETCH_MAX_REDIRECTS,
    DEFAULT_FETCH_MAX_REDIRECTS,
  );
  const timeoutMs = boundedPositive(
    options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS,
    DEFAULT_FETCH_TIMEOUT_MS,
  );
  const cacheKey = cacheKeyFor(requestedUrl, options.method ?? 'GET');
  const redirects: RedirectHop[] = [];
  const visited = new Set<string>([canonicalUrl(requestedUrl)]);
  let current = requestedUrl;

  for (;;) {
    const address = await assertSafeTarget(current, options, redirects);
    if (current === requestedUrl) {
      const cached = await readCachedResponse(cacheKey, options, maxBytes);
      if (cached) {
        // Cached responses must still revalidate the current and final DNS answers so the
        // cache cannot bypass the SSRF/rebinding policy.
        await assertSafeTarget(cached.finalUrl, options, redirects);
        return { ...cached, requestedUrl, observedAt: new Date().toISOString() };
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
      redirects.push({
        from: current,
        to: next,
        status: response.status,
        crossOrigin: new URL(current).origin !== new URL(next).origin,
      });
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
    };
    await writeCachedResponse(cacheKey, result, options);
    return result;
  }
}

export async function fetchManifest(
  originOrUrl: string,
  options: FetchOptions = {},
): Promise<ManifestFetchResponse> {
  const response = await fetchEom(discoveryUrl(originOrUrl), options);
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
  if (isPrivateOrLocalHostname(parsed.hostname) && options.allowPrivateHosts !== true) {
    throw new EomFetchError(
      'EOM_FETCH_PRIVATE_HOST',
      'Private and local hosts are not fetchable by default.',
      value,
      redirects,
    );
  }
  if (isIP(parsed.hostname) !== 0) {
    if (isBlockedIp(parsed.hostname) && options.allowPrivateHosts !== true) {
      throw new EomFetchError(
        'EOM_FETCH_PRIVATE_HOST',
        'The target IP is private or reserved.',
        value,
        redirects,
      );
    }
    return parsed.hostname;
  }
  let addresses: readonly { address: string }[];
  try {
    addresses = await (options.dnsLookup ?? defaultDnsLookup)(parsed.hostname);
  } catch (error) {
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
      const request = requestFunction(
        {
          protocol: parsed.protocol,
          hostname: address,
          port: parsed.port || undefined,
          path: `${parsed.pathname}${parsed.search}`,
          method: options.method ?? 'GET',
          headers: {
            accept: 'application/json',
            'accept-encoding': 'identity',
            'user-agent': options.userAgent ?? 'paperandslate-eom/1.0.0-rc.2',
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
          response.on('data', (chunk: Buffer | string) => {
            if (settled || options.method === 'HEAD') return;
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            total += buffer.length;
            if (total > maxBytes) {
              settled = true;
              request.destroy();
              reject(
                new EomFetchError(
                  'EOM_FETCH_TOO_LARGE',
                  'The response exceeds the configured byte limit.',
                  url,
                  redirects,
                ),
              );
              return;
            }
            chunks.push(buffer);
          });
          response.on('end', () => {
            if (settled) return;
            settled = true;
            resolve({
              status: response.statusCode ?? 0,
              headers,
              body: Buffer.concat(chunks),
            });
          });
          response.on('error', (error) => {
            if (settled) return;
            settled = true;
            reject(error);
          });
          response.on('aborted', () => {
            if (settled) return;
            settled = true;
            reject(new Error('The response was aborted before completion.'));
          });
        },
      );
      const timer = setTimeout(() => {
        timedOut = true;
        request.destroy();
      }, timeoutMs);
      const abort = (): void => {
        request.destroy();
      };
      options.signal?.addEventListener('abort', abort, { once: true });
      request.on('error', (error) => {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
        if (settled) return;
        settled = true;
        reject(
          timedOut || options.signal?.aborted
            ? new EomFetchError(
                'EOM_FETCH_TIMEOUT',
                'The EOM request timed out or was cancelled.',
                url,
                redirects,
              )
            : error,
        );
      });
      request.on('close', () => {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
      });
      request.end();
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
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

function normalizeRequestUrl(value: string): string {
  try {
    const parsed = new URL(value);
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

function boundedPositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function boundedNonNegative(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

async function readCachedResponse(
  key: string,
  options: FetchOptions,
  maxBytes: number,
): Promise<FetchResponse | undefined> {
  if (!options.cacheDirectory) return undefined;
  const path = join(resolve(options.cacheDirectory), `${key}.json`);
  try {
    const information = await stat(path);
    const maxAge = boundedNonNegative(
      options.cacheMaxAgeMs ?? DEFAULT_FETCH_CACHE_MAX_AGE_MS,
      DEFAULT_FETCH_CACHE_MAX_AGE_MS,
    );
    if (Date.now() - information.mtimeMs > maxAge) return undefined;
    const value = JSON.parse(await readFile(path, 'utf8')) as Partial<FetchResponse>;
    if (
      typeof value.requestedUrl !== 'string' ||
      typeof value.finalUrl !== 'string' ||
      typeof value.status !== 'number' ||
      typeof value.body !== 'string' ||
      Buffer.byteLength(value.body, 'utf8') > maxBytes ||
      !value.headers ||
      typeof value.headers !== 'object' ||
      !Array.isArray(value.redirects) ||
      typeof value.observedAt !== 'string'
    ) {
      return undefined;
    }
    return value as FetchResponse;
  } catch {
    return undefined;
  }
}

async function writeCachedResponse(
  key: string,
  response: FetchResponse,
  options: FetchOptions,
): Promise<void> {
  if (!options.cacheDirectory) return;
  try {
    const directory = resolve(options.cacheDirectory);
    await mkdir(directory, { recursive: true });
    const maxEntries = boundedPositive(
      options.cacheMaxEntries ?? DEFAULT_FETCH_CACHE_MAX_ENTRIES,
      DEFAULT_FETCH_CACHE_MAX_ENTRIES,
    );
    const entries = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => join(directory, entry.name));
    if (entries.length >= maxEntries) {
      const dated = await Promise.all(
        entries.map(async (entry) => ({ entry, modified: (await stat(entry)).mtimeMs })),
      );
      dated.sort((left, right) => left.modified - right.modified);
      for (const item of dated.slice(0, Math.max(1, entries.length - maxEntries + 1))) {
        await unlink(item.entry).catch(() => undefined);
      }
    }
    const path = join(directory, `${key}.json`);
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(response), 'utf8');
    await rename(temporary, path);
  } catch {
    // A cache is an optimization. Network retrieval remains authoritative when it cannot be written.
  }
}

function cacheKeyFor(url: string, method: string): string {
  return createHash('sha256').update(`${method}\0${url}`).digest('hex');
}

function isBlockedIp(value: string): boolean {
  if (value.includes(':')) return isBlockedIpv6(value);
  const parts = value.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }
  const [a, b, c] = parts;
  if (a === undefined || b === undefined || c === undefined) return true;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 2 || b === 168)) ||
    (a === 198 && b >= 18 && b <= 19) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isBlockedIpv6(value: string): boolean {
  const normalized = value.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  )
    return true;
  if (normalized.startsWith('ff')) return true;
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/u)?.[1];
  return mapped ? isBlockedIp(mapped) : false;
}
