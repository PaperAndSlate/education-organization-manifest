import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { open, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

const MAX_FIXTURE_FILE_BYTES = 32 * 1024 * 1024;

export interface FixturePublisherOptions {
  readonly directory: string;
  readonly host?: string;
  readonly port?: number;
  readonly redirects?: Readonly<Record<string, string>>;
  readonly statuses?: Readonly<Record<string, number>>;
  readonly contentTypes?: Readonly<Record<string, string>>;
  readonly delayMs?: number;
}

export interface FixturePublisherRequest {
  readonly method: string;
  readonly path: string;
  readonly observedAt: string;
}

export interface FixturePublisher {
  readonly origin: string;
  readonly discoveryUrl: string;
  readonly requests: readonly FixturePublisherRequest[];
  close(): Promise<void>;
}

/**
 * Start a deliberately local, deterministic HTTP publisher for conformance tests.
 * It serves only files below the supplied capture directory and never proxies a URL.
 */
export async function startFixturePublisher(
  options: FixturePublisherOptions,
): Promise<FixturePublisher> {
  const directory = await realpath(resolve(options.directory));
  const information = await stat(directory);
  if (!information.isDirectory()) throw new Error(`${directory} is not a directory.`);
  const requests: FixturePublisherRequest[] = [];
  const server = createServer((request, response) => {
    void handleRequest(request, response, directory, options, requests);
  });
  const host = options.host ?? '127.0.0.1';
  await listen(server, host, options.port ?? 0);
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Fixture publisher did not bind a port.');
  const origin = `http://${host}:${address.port}`;
  return {
    origin,
    discoveryUrl: `${origin}/.well-known/educational-organization-manifest`,
    requests,
    close: () => close(server),
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  directory: string,
  options: FixturePublisherOptions,
  requests: FixturePublisherRequest[],
): Promise<void> {
  const method = request.method ?? 'GET';
  const rawUrl = request.url ?? '/';
  const parsed = new URL(rawUrl, 'http://fixture.invalid');
  const path = parsed.pathname;
  requests.push({ method, path, observedAt: new Date().toISOString() });
  if (options.delayMs && options.delayMs > 0) await delay(options.delayMs);
  if (method !== 'GET' && method !== 'HEAD') {
    send(response, 405, 'text/plain; charset=utf-8', Buffer.from('method not allowed\n'));
    return;
  }
  const status = options.statuses?.[path];
  if (status !== undefined && status !== 200) {
    send(response, status, 'application/json', Buffer.from('{}\n'));
    return;
  }
  const redirect = options.redirects?.[path];
  if (redirect) {
    response.writeHead(308, {
      location: redirect,
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    });
    response.end();
    return;
  }
  const relativePath =
    path === '/.well-known/educational-organization-manifest'
      ? '.well-known/educational-organization-manifest'
      : path.replace(/^\//u, '');
  const candidate = resolve(join(directory, relativePath));
  if (
    candidate !== directory &&
    !candidate.startsWith(`${directory}\\`) &&
    !candidate.startsWith(`${directory}/`)
  ) {
    send(response, 404, 'application/json', Buffer.from('{}\n'));
    return;
  }
  try {
    const resolvedCandidate = await realpath(candidate);
    const candidateRelative = relative(directory, resolvedCandidate);
    if (
      candidateRelative === '..' ||
      candidateRelative.startsWith(`..${sep}`) ||
      isAbsolute(candidateRelative)
    ) {
      send(response, 404, 'application/json', Buffer.from('{}\n'));
      return;
    }
    const fileStat = await stat(resolvedCandidate);
    if (!fileStat.isFile()) throw new Error('not a file');
    if (fileStat.size > MAX_FIXTURE_FILE_BYTES) {
      send(response, 413, 'application/json', Buffer.from('{}\n'));
      return;
    }
    const body = await readBoundedFile(resolvedCandidate, MAX_FIXTURE_FILE_BYTES);
    const contentType = options.contentTypes?.[path] ?? 'application/json';
    const etag = `"${createHash('sha256').update(body).digest('hex')}"`;
    const headers = {
      'content-type': contentType,
      'content-length': String(body.byteLength),
      etag,
      'cache-control': 'public, max-age=60, stale-while-revalidate=60',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, HEAD',
    };
    response.writeHead(200, headers);
    if (method === 'HEAD') response.end();
    else response.end(body);
  } catch {
    send(response, 404, 'application/json', Buffer.from('{}\n'));
  }
}

async function readBoundedFile(path: string, maxBytes: number): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const information = await handle.stat();
    if (!information.isFile() || information.size > maxBytes) {
      throw new Error('fixture file exceeds its byte limit');
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes - total + 1));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > maxBytes) throw new Error('fixture file exceeds its byte limit');
      chunks.push(chunk.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks, total);
  } finally {
    await handle.close();
  }
}

function send(response: ServerResponse, status: number, contentType: string, body: Buffer): void {
  response.writeHead(status, {
    'content-type': contentType,
    'content-length': String(body.byteLength),
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  });
  response.end(body);
}

function listen(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const onError = (error: Error): void => {
      server.removeListener('listening', onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.removeListener('error', onError);
      resolvePromise();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()));
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
