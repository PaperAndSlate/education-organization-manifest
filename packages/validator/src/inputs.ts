import { open, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import {
  EomFetchError,
  fetchEom,
  fetchManifest,
  isJsonObject,
  originOf,
  parseStrictJson,
  type JsonObject,
  type FetchOptions,
  type FetchResponse,
} from '@paperandslate/eom-core';
import { evaluateAuthority } from '@paperandslate/eom-authority';
import { finding, hasErrors, type Finding } from './findings.js';
import { publicationSetFindings } from './semantic.js';
import { validateDocument, type ValidationOptions } from './engine.js';

export interface PublicationValidationOptions extends ValidationOptions {
  readonly maxFiles?: number;
  readonly maxResources?: number;
  readonly maxDepth?: number;
  readonly maxBytes?: number;
  readonly maxTotalBytes?: number;
  readonly fetchGraph?: boolean;
  readonly fetch?: FetchOptions;
  readonly transport?: PublicationTransport;
}

export interface PublicationTransport {
  readonly fetchManifest: typeof fetchManifest;
  readonly fetchEom: typeof fetchEom;
}

export interface PublicationValidationResult {
  readonly valid: boolean;
  readonly structuralValid: boolean;
  readonly semanticValid: boolean;
  readonly findings: readonly Finding[];
  readonly documents: Readonly<Record<string, unknown>>;
  readonly files: readonly string[];
  readonly fetches: readonly PublicationFetchRecord[];
  readonly rootUrl?: string;
}

export interface PublicationFetchRecord {
  readonly declaredUrl: string;
  readonly requestedUrl: string;
  readonly finalUrl: string;
  readonly redirects: FetchResponse['redirects'];
  readonly cached: boolean;
}

/** Validate every JSON document in a local publication tree as one graph. */
export async function validatePublicationDirectory(
  directory: string,
  options: PublicationValidationOptions = {},
): Promise<PublicationValidationResult> {
  const root = resolve(directory);
  const maxFiles = positiveLimit(options.maxFiles, 256);
  const maxBytes = positiveLimit(options.maxBytes, 10 * 1024 * 1024);
  const maxDepth = nonNegativeLimit(options.maxDepth, 32);
  const maxTotalBytes = positiveLimit(options.maxTotalBytes, 32 * 1024 * 1024);
  const walked = await publicationFiles(root, maxFiles, maxDepth);
  const paths = walked.paths;
  const findings: Finding[] = [];
  const documents: Record<string, unknown> = {};
  const files = paths.slice(0, maxFiles).map((path) => relative(root, path).replaceAll('\\', '/'));
  if (walked.fileLimitExceeded) {
    findings.push(
      finding(
        'EOM_GRAPH_FILE_LIMIT',
        'quality',
        `The publication contains more than ${maxFiles} JSON files.`,
        {
          severity: 'error',
        },
      ),
    );
  }
  if (walked.depthLimitExceeded) {
    findings.push(
      finding(
        'EOM_GRAPH_DEPTH_LIMIT',
        'transport',
        `The publication contains files deeper than the configured ${maxDepth}-level limit.`,
        { severity: 'error' },
      ),
    );
  }
  let totalBytes = 0;
  for (const path of paths.slice(0, maxFiles)) {
    const name = relative(root, path).replaceAll('\\', '/');
    try {
      const information = await stat(path);
      if (!information.isFile()) {
        throw new Error('The publication entry is not a regular file.');
      }
      if (totalBytes + information.size > maxTotalBytes) {
        findings.push(
          finding(
            'EOM_GRAPH_TOTAL_BYTES',
            'transport',
            `The publication exceeds the configured ${maxTotalBytes}-byte total limit.`,
            { resource: name, severity: 'error' },
          ),
        );
        break;
      }
      if (information.size > maxBytes) {
        findings.push(
          finding(
            'EOM_GRAPH_FILE_BYTES',
            'transport',
            `The publication file exceeds the configured ${maxBytes}-byte limit.`,
            { resource: name, severity: 'error' },
          ),
        );
        continue;
      }
      const bytes = await readBoundedFile(path, maxBytes);
      totalBytes += bytes.byteLength;
      if (totalBytes > maxTotalBytes) {
        findings.push(
          finding(
            'EOM_GRAPH_TOTAL_BYTES',
            'transport',
            `The publication exceeds the configured ${maxTotalBytes}-byte total limit.`,
            { resource: name, severity: 'error' },
          ),
        );
        break;
      }
      const document = parseStrictJson(decodeUtf8(bytes, path), path);
      documents[name] = document;
      const result = validateDocument(document, options);
      findings.push(
        ...result.findings.map((item) => ({ ...item, resource: item.resource ?? name })),
      );
    } catch (error) {
      if (error instanceof BoundedFileError) {
        findings.push(
          finding(
            'EOM_GRAPH_FILE_BYTES',
            'transport',
            `The publication file exceeds the configured ${maxBytes}-byte limit.`,
            { resource: name, severity: 'error' },
          ),
        );
        continue;
      }
      findings.push(
        finding(
          'EOM_JSON_PARSE',
          'syntax',
          error instanceof Error ? error.message : 'Invalid JSON.',
          {
            resource: name,
          },
        ),
      );
    }
  }
  findings.push(
    ...publicationSetFindings(documents, options).map((item) => ({
      ...item,
      resource: item.resource ?? 'publication-set',
    })),
  );
  return publicationResult(documents, files, findings);
}

class BoundedFileError extends Error {}

async function readBoundedFile(path: string, maxBytes: number): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const information = await handle.stat();
    if (!information.isFile() || information.size > maxBytes) {
      throw new BoundedFileError('The publication file exceeds its byte limit.');
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes - total + 1));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > maxBytes) {
        throw new BoundedFileError('The publication file exceeds its byte limit.');
      }
      chunks.push(chunk.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks, total);
  } finally {
    await handle.close();
  }
}

/** Retrieve and validate a public manifest and its declared resource graph. */
export async function validatePublicationUrl(
  originOrUrl: string,
  options: PublicationValidationOptions = {},
): Promise<PublicationValidationResult> {
  const documents: Record<string, unknown> = {};
  const findings: Finding[] = [];
  let rootUrl: string | undefined;
  const files: string[] = [];
  const fetches: PublicationFetchRecord[] = [];
  const transport = options.transport;
  const fetchOptions: FetchOptions = {
    ...options.fetch,
    ...(options.maxBytes !== undefined && options.fetch?.maxBytes === undefined
      ? { maxBytes: options.maxBytes }
      : {}),
  };
  try {
    const rootResponse = await (transport?.fetchManifest ?? fetchManifest)(
      originOrUrl,
      fetchOptions,
    );
    rootUrl = rootResponse.finalUrl;
    documents[rootResponse.finalUrl] = rootResponse.document;
    files.push(rootResponse.finalUrl);
    fetches.push({
      declaredUrl: rootResponse.requestedUrl,
      requestedUrl: rootResponse.requestedUrl,
      finalUrl: rootResponse.finalUrl,
      redirects: rootResponse.redirects,
      cached: false,
    });
    const requestedOrigin = originOf(rootResponse.requestedUrl);
    const finalOrigin = originOf(rootResponse.finalUrl);
    const rootRedirectSafe =
      requestedOrigin !== undefined &&
      finalOrigin !== undefined &&
      requestedOrigin === finalOrigin &&
      rootResponse.redirects.every((redirect) => {
        const fromOrigin = originOf(redirect.from);
        const toOrigin = originOf(redirect.to);
        return (
          fromOrigin !== undefined && fromOrigin === toOrigin && redirect.crossOrigin === false
        );
      });
    if (!rootRedirectSafe) {
      findings.push(
        finding(
          'EOM_AUTHORITY_ROOT_REDIRECT_ORIGIN',
          'security',
          'The discovered root manifest must not cross origins during redirect resolution.',
          {
            severity: 'error',
            resource: rootResponse.finalUrl,
            related: [rootResponse.requestedUrl, rootResponse.finalUrl],
          },
        ),
      );
    }
    const rootResult = validateDocument(rootResponse.document, options);
    findings.push(
      ...rootResult.findings.map((item) => ({
        ...item,
        resource: item.resource ?? rootResponse.finalUrl,
      })),
    );
    if (options.fetchGraph !== false && isJsonObject(rootResponse.document)) {
      const maxResources = positiveLimit(options.maxResources, 64);
      const maxDepth = nonNegativeLimit(options.maxDepth, 1);
      const maxTotalBytes = positiveLimit(options.maxTotalBytes, 32 * 1024 * 1024);
      let totalBytes = Buffer.byteLength(rootResponse.body, 'utf8');
      const queue: Array<{
        readonly href: string;
        readonly depth: number;
        readonly resource: JsonObject;
      }> = [];
      const queued = new Set<string>([
        canonicalUrl(rootResponse.requestedUrl),
        canonicalUrl(rootResponse.finalUrl),
      ]);
      const cache = new Map<
        string,
        {
          readonly finalUrl: string;
          readonly document: unknown;
          readonly bytes: number;
          readonly redirects: FetchResponse['redirects'];
        }
      >();
      let resourceLimitReported = false;
      let totalBytesLimitReached = totalBytes > maxTotalBytes;
      cache.set(canonicalUrl(rootResponse.requestedUrl), {
        finalUrl: rootResponse.finalUrl,
        document: rootResponse.document,
        bytes: totalBytes,
        redirects: rootResponse.redirects,
      });
      cache.set(canonicalUrl(rootResponse.finalUrl), {
        finalUrl: rootResponse.finalUrl,
        document: rootResponse.document,
        bytes: totalBytes,
        redirects: rootResponse.redirects,
      });
      if (totalBytesLimitReached) {
        findings.push(
          finding(
            'EOM_GRAPH_TOTAL_BYTES',
            'transport',
            `The publication graph exceeds the configured ${maxTotalBytes}-byte limit.`,
            { resource: rootResponse.finalUrl, severity: 'error' },
          ),
        );
      } else if (!rootRedirectSafe) {
        // A cross-origin discovery redirect cannot be authorized yet: the
        // redirected document is not trusted until a root manifest from the
        // requested origin has been obtained. Do not follow its declarations.
      } else {
        enqueueResources(rootResponse.document, 1, queue, queued, maxDepth, findings);
      }
      if (queue.length > maxResources) {
        resourceLimitReported = true;
        findings.push(
          finding(
            'EOM_GRAPH_RESOURCE_LIMIT',
            'transport',
            `The publication declares more than ${maxResources} resources.`,
            {
              severity: 'error',
              resource: rootResponse.finalUrl,
            },
          ),
        );
      }
      let fetchedResources = 0;
      while (queue.length > 0 && fetchedResources < maxResources && !totalBytesLimitReached) {
        const next = queue.shift();
        if (!next) break;
        fetchedResources += 1;
        try {
          const requestKey = canonicalUrl(next.href);
          const cached = cache.get(requestKey);
          let finalUrl: string;
          let document: unknown;
          let responseBytes: number;
          let redirects: FetchResponse['redirects'];
          let cachedResponse = false;
          if (cached) {
            finalUrl = cached.finalUrl;
            document = cached.document;
            responseBytes = cached.bytes;
            redirects = cached.redirects;
            cachedResponse = true;
          } else {
            const response = await (transport?.fetchEom ?? fetchEom)(next.href, fetchOptions);
            responseBytes = Buffer.byteLength(response.body, 'utf8');
            finalUrl = response.finalUrl;
            redirects = response.redirects;
            document = parseStrictJson(response.body, response.finalUrl);
            cache.set(requestKey, {
              finalUrl,
              document,
              bytes: responseBytes,
              redirects,
            });
            cache.set(canonicalUrl(finalUrl), {
              finalUrl,
              document,
              bytes: responseBytes,
              redirects,
            });
          }
          if (totalBytes + responseBytes > maxTotalBytes) {
            findings.push(
              finding(
                'EOM_GRAPH_TOTAL_BYTES',
                'transport',
                `The publication graph exceeds the configured ${maxTotalBytes}-byte limit.`,
                { resource: next.href, severity: 'error' },
              ),
            );
            totalBytesLimitReached = true;
            break;
          }
          totalBytes += responseBytes;
          documents[finalUrl] = document;
          if (!files.includes(finalUrl)) files.push(finalUrl);
          fetches.push({
            declaredUrl: next.href,
            requestedUrl: next.href,
            finalUrl,
            redirects,
            cached: cachedResponse,
          });
          let authorityAccepted = true;
          const authorityUrls = [
            next.href,
            finalUrl,
            ...redirects.flatMap((redirect) => [redirect.from, redirect.to]),
          ].filter((url, index, values) => values.indexOf(url) === index);
          for (const authorityUrl of authorityUrls) {
            const authority = evaluateAuthority(
              rootResponse.document,
              next.resource,
              authorityUrl,
              options.now === undefined ? {} : { now: options.now },
            );
            if (!authority.accepted) {
              authorityAccepted = false;
              findings.push(
                ...authority.findings.map((item) => ({
                  ...item,
                  resource: item.resource ?? authorityUrl,
                  related: [...(item.related ?? []), next.href, finalUrl].filter(
                    (value, index, values) => values.indexOf(value) === index,
                  ),
                })),
              );
            }
          }
          const result = validateDocument(document, options);
          findings.push(
            ...result.findings.map((item) => ({
              ...item,
              resource: item.resource ?? finalUrl,
            })),
          );
          // A resource that failed any declared/final/redirect authority check
          // is still reported and validated as data, but its declarations are
          // not trusted as a new graph frontier.
          if (authorityAccepted && isJsonObject(document)) {
            enqueueResources(document, next.depth + 1, queue, queued, maxDepth, findings);
          }
        } catch (error) {
          if (error instanceof EomFetchError) {
            const finalUrl = error.url ?? next.href;
            fetches.push({
              declaredUrl: next.href,
              requestedUrl: next.href,
              finalUrl,
              redirects: error.redirects,
              cached: false,
            });
          }
          findings.push(fetchFinding(error, next.href));
        }
      }
      if (queue.length > 0 && !resourceLimitReported && !totalBytesLimitReached) {
        findings.push(
          finding(
            'EOM_GRAPH_RESOURCE_LIMIT',
            'transport',
            `The publication graph stopped after the ${maxResources}-resource limit.`,
            { resource: rootResponse.finalUrl, severity: 'error' },
          ),
        );
      }
    }
  } catch (error) {
    if (error instanceof EomFetchError) {
      fetches.push({
        declaredUrl: originOrUrl,
        requestedUrl: originOrUrl,
        finalUrl: error.url ?? originOrUrl,
        redirects: error.redirects,
        cached: false,
      });
    }
    findings.push(fetchFinding(error, originOrUrl));
  }
  findings.push(
    ...publicationSetFindings(documents, options).map((item) => ({
      ...item,
      resource: item.resource ?? 'publication-set',
    })),
  );
  return {
    ...publicationResult(documents, files, findings, fetches),
    ...(rootUrl ? { rootUrl } : {}),
  };
}

interface PublicationFileWalk {
  readonly paths: readonly string[];
  readonly fileLimitExceeded: boolean;
  readonly depthLimitExceeded: boolean;
}

async function publicationFiles(
  directory: string,
  maxFiles: number,
  maxDepth: number,
): Promise<PublicationFileWalk> {
  const result: string[] = [];
  let fileLimitExceeded = false;
  let depthLimitExceeded = false;
  async function visit(current: string, depth: number): Promise<void> {
    if (fileLimitExceeded) return;
    if (depth > maxDepth) {
      depthLimitExceeded = true;
      return;
    }
    const entries = (await readdir(current, { withFileTypes: true })).sort((left, right) =>
      compareStrings(left.name, right.name),
    );
    for (const entry of entries) {
      if (fileLimitExceeded) return;
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build')
        continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (depth >= maxDepth) {
          depthLimitExceeded = true;
          continue;
        }
        await visit(path, depth + 1);
      } else if (
        entry.isFile() &&
        (entry.name === 'educational-organization-manifest' ||
          (entry.name.endsWith('.json') && !isGeneratedMetadata(entry.name)))
      ) {
        if (result.length >= maxFiles) {
          fileLimitExceeded = true;
          return;
        }
        result.push(path);
      }
    }
  }
  await visit(directory, 0);
  return {
    paths: result.sort(compareStrings),
    fileLimitExceeded,
    depthLimitExceeded,
  };
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isGeneratedMetadata(name: string): boolean {
  return new Set([
    '.eom-generated.json',
    'input-manifest.json',
    'output-manifest.json',
    'validation.json',
    'lint.json',
    'source-map.json',
    'reproducibility.json',
    'build-report.json',
  ]).has(name);
}

function publicationResult(
  documents: Readonly<Record<string, unknown>>,
  files: readonly string[],
  findings: readonly Finding[],
  fetches: readonly PublicationFetchRecord[] = [],
): PublicationValidationResult {
  const structuralValid = !findings.some(
    (item) =>
      item.severity === 'error' && (item.category === 'syntax' || item.category === 'structural'),
  );
  const semanticValid = !findings.some(
    (item) => item.severity === 'error' && item.category === 'semantic',
  );
  return {
    valid: !hasErrors(findings),
    structuralValid,
    semanticValid,
    findings,
    documents,
    files,
    fetches,
  };
}

function fetchFinding(error: unknown, resource: string): Finding {
  return finding(
    error instanceof EomFetchError ? error.code : 'EOM_FETCH_NETWORK',
    'transport',
    error instanceof Error ? error.message : 'The publication graph request failed.',
    { resource },
  );
}

function positiveLimit(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function decodeUtf8(bytes: Uint8Array, source: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(
      `Invalid UTF-8 in ${source}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function nonNegativeLimit(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function enqueueResources(
  document: JsonObject,
  depth: number,
  queue: Array<{
    readonly href: string;
    readonly depth: number;
    readonly resource: JsonObject;
  }>,
  queued: Set<string>,
  maxDepth: number,
  findings: Finding[],
): void {
  const resources = Array.isArray(document.resources) ? document.resources : [];
  if (resources.length === 0 || depth > maxDepth) return;
  for (const resource of resources) {
    if (!isJsonObject(resource) || typeof resource.href !== 'string') continue;
    const resourceId = typeof resource.id === 'string' ? resource.id : '';
    const resourceType = typeof resource.type === 'string' ? resource.type : '';
    let canonical: string;
    try {
      canonical = canonicalUrl(resource.href);
    } catch {
      findings.push(
        finding(
          'EOM_RESOURCE_URL_INVALID',
          'structural',
          'A publication resource href must be an absolute URL.',
          { severity: 'error', resource: resource.href },
        ),
      );
      continue;
    }
    const key = `${canonical}|${resourceId}|${resourceType}`;
    if (queued.has(key)) continue;
    queued.add(key);
    queue.push({ href: resource.href, depth, resource });
  }
}

function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  return url.toString();
}
