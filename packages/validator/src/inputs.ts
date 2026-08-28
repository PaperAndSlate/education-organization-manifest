import { lstat, open, opendir, realpath } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  EomFetchError,
  fetchEom,
  fetchManifest,
  isJsonObject,
  originOf,
  parseStrictJson,
  stringifyCanonical,
  type JsonObject,
  type FetchOptions,
  type FetchResponse,
} from '@paperandslate/eom-core';
import {
  evaluateAuthority,
  resourceDescriptorMatchesDocument,
  rootManifestOriginMatchesObserved,
} from '@paperandslate/eom-authority';
import { finding, hasErrors, type Finding } from './findings.js';
import { publicationSetFindings } from './semantic.js';
import { validateDocument, type ValidationOptions } from './engine.js';

export const MAX_PUBLICATION_FILES = 4096;
export const MAX_PUBLICATION_RESOURCES = 4096;
export const MAX_PUBLICATION_DEPTH = 128;
export const MAX_PUBLICATION_FILE_BYTES = 64 * 1024 * 1024;
export const MAX_PUBLICATION_TOTAL_BYTES = 256 * 1024 * 1024;
export const MAX_PUBLICATION_DIRECTORY_ENTRIES = 100_000;

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
  const rootInformation = await lstat(root);
  if (!rootInformation.isDirectory() || rootInformation.isSymbolicLink()) {
    throw new Error(`${directory} is not a stable directory.`);
  }
  const expectedRootRealPath = await realpath(root);
  if (normalizeFsPath(expectedRootRealPath) !== normalizeFsPath(root)) {
    throw new Error(`${directory} must not traverse a symbolic link.`);
  }
  const maxFiles = positiveLimit(options.maxFiles, 256, MAX_PUBLICATION_FILES);
  const maxBytes = positiveLimit(options.maxBytes, 10 * 1024 * 1024, MAX_PUBLICATION_FILE_BYTES);
  const maxDepth = nonNegativeLimit(options.maxDepth, 32, MAX_PUBLICATION_DEPTH);
  const maxTotalBytes = positiveLimit(
    options.maxTotalBytes,
    32 * 1024 * 1024,
    MAX_PUBLICATION_TOTAL_BYTES,
  );
  const walked = await publicationFiles(
    root,
    maxFiles,
    maxDepth,
    MAX_PUBLICATION_DIRECTORY_ENTRIES,
  );
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
  if (walked.entryLimitExceeded) {
    findings.push(
      finding(
        'EOM_GRAPH_DIRECTORY_ENTRY_LIMIT',
        'security',
        `The publication directory traversal exceeded the ${MAX_PUBLICATION_DIRECTORY_ENTRIES}-entry safety limit.`,
        { severity: 'error' },
      ),
    );
  }
  for (const path of walked.symlinkPaths) {
    findings.push(
      finding(
        'EOM_GRAPH_SYMLINK',
        'security',
        'A publication must not contain symbolic links or junctions that can escape its output root.',
        {
          resource: relative(root, path).replaceAll('\\', '/'),
          severity: 'error',
        },
      ),
    );
  }
  if (walked.symlinkLimitExceeded) {
    findings.push(
      finding(
        'EOM_GRAPH_SYMLINK_LIMIT',
        'security',
        `The publication contains more symbolic links than the configured ${maxFiles}-entry reporting limit.`,
        { severity: 'error' },
      ),
    );
  }
  let totalBytes = 0;
  for (const path of paths.slice(0, maxFiles)) {
    const name = relative(root, path).replaceAll('\\', '/');
    try {
      const information = await lstat(path);
      if (!information.isFile() || information.isSymbolicLink()) {
        throw new BoundedFileError(
          'The publication entry is not a stable regular file.',
          information.isSymbolicLink(),
        );
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
      if (error instanceof BoundedFileError && error.symlink) {
        findings.push(
          finding(
            'EOM_GRAPH_SYMLINK',
            'security',
            'A publication file changed into a symbolic link while it was being read.',
            { resource: name, severity: 'error' },
          ),
        );
        continue;
      }
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

class BoundedFileError extends Error {
  public constructor(
    message: string,
    public readonly symlink = false,
  ) {
    super(message);
    this.name = 'BoundedFileError';
  }
}

async function readBoundedFile(path: string, maxBytes: number): Promise<Buffer> {
  const linkInformation = await lstat(path);
  if (!linkInformation.isFile() || linkInformation.isSymbolicLink()) {
    throw new BoundedFileError(
      'The publication file must be a stable regular file.',
      linkInformation.isSymbolicLink(),
    );
  }
  const expectedRealPath = await realpath(path);
  if (normalizeFsPath(expectedRealPath) !== normalizeFsPath(path)) {
    throw new BoundedFileError('The publication file must not traverse a symbolic link.', true);
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
    if (!information.isFile() || identityChanged || information.size > maxBytes) {
      throw new BoundedFileError('The publication file exceeds its byte limit.');
    }
    const currentRealPath = await realpath(path);
    if (
      normalizeFsPath(currentRealPath) !== normalizeFsPath(expectedRealPath) ||
      normalizeFsPath(currentRealPath) !== normalizeFsPath(path)
    ) {
      throw new BoundedFileError('The publication file changed its filesystem identity.', true);
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

function normalizeFsPath(value: string): string {
  const resolved = resolve(value);
  return process.platform === 'win32' ? resolved.replaceAll('/', '\\').toLowerCase() : resolved;
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
      cached: rootResponse.cached === true,
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
    const rootIdentityBound = rootManifestOriginMatchesObserved(
      rootResponse.document,
      rootResponse.finalUrl,
    );
    if (!rootIdentityBound) {
      findings.push(
        finding(
          'EOM_AUTHORITY_ROOT_ORIGIN_MISMATCH',
          'security',
          'The root manifest authority origin does not match the origin from which the manifest was observed.',
          {
            severity: 'error',
            resource: rootResponse.finalUrl,
            related: [rootResponse.requestedUrl, rootResponse.finalUrl],
          },
        ),
      );
    }
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
      const maxResources = positiveLimit(options.maxResources, 64, MAX_PUBLICATION_RESOURCES);
      const maxDepth = nonNegativeLimit(options.maxDepth, 1, MAX_PUBLICATION_DEPTH);
      const maxTotalBytes = positiveLimit(
        options.maxTotalBytes,
        32 * 1024 * 1024,
        MAX_PUBLICATION_TOTAL_BYTES,
      );
      let totalBytes = Buffer.byteLength(rootResponse.body, 'utf8');
      const queue: Array<{
        readonly href: string;
        readonly depth: number;
        readonly resource: JsonObject;
      }> = [];
      // Do not seed this set with the root URL. A root manifest may declare
      // itself as a resource, and that descriptor still needs the same
      // identity, subject, and final-URL authority checks as every other
      // queued resource. The in-run cache below avoids a second network read.
      const queued = new Set<string>();
      type GraphCacheEntry = {
        readonly finalUrl: string;
        readonly document: unknown;
        readonly bytes: number;
        readonly redirects: FetchResponse['redirects'];
        charged: boolean;
      };
      const cache = new Map<string, GraphCacheEntry>();
      let resourceLimitReported = false;
      let depthLimitReached = false;
      let totalBytesLimitReached = totalBytes > maxTotalBytes;
      const rootCacheEntry: GraphCacheEntry = {
        finalUrl: rootResponse.finalUrl,
        document: rootResponse.document,
        bytes: totalBytes,
        redirects: rootResponse.redirects,
        charged: true,
      };
      cache.set(canonicalUrl(rootResponse.requestedUrl), rootCacheEntry);
      cache.set(canonicalUrl(rootResponse.finalUrl), rootCacheEntry);
      if (totalBytesLimitReached) {
        findings.push(
          finding(
            'EOM_GRAPH_TOTAL_BYTES',
            'transport',
            `The publication graph exceeds the configured ${maxTotalBytes}-byte limit.`,
            { resource: rootResponse.finalUrl, severity: 'error' },
          ),
        );
      } else if (!rootRedirectSafe || !rootIdentityBound) {
        // A cross-origin discovery redirect cannot be authorized yet: the
        // redirected document is not trusted until a root manifest from the
        // requested origin has been obtained. Do not follow its declarations.
      } else {
        const enqueueResult = enqueueResources(
          rootResponse.document,
          1,
          queue,
          queued,
          maxDepth,
          maxResources,
          findings,
        );
        depthLimitReached ||= enqueueResult.depthLimitReached;
        if (enqueueResult.resourceLimitReached) {
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
            cachedResponse = response.cached === true;
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
            const fetchedEntry: GraphCacheEntry = {
              finalUrl,
              document,
              bytes: responseBytes,
              redirects,
              charged: false,
            };
            cache.set(requestKey, fetchedEntry);
            cache.set(canonicalUrl(finalUrl), fetchedEntry);
          }
          const cacheEntry = cached ?? cache.get(requestKey);
          const needsByteCharge = cacheEntry?.charged !== true;
          if (needsByteCharge && totalBytes + responseBytes > maxTotalBytes) {
            fetches.push({
              declaredUrl: next.href,
              requestedUrl: next.href,
              finalUrl,
              redirects,
              cached: cachedResponse,
            });
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
          if (needsByteCharge) {
            totalBytes += responseBytes;
            if (cacheEntry) cacheEntry.charged = true;
          }
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
          if (!resourceDescriptorMatchesDocument(next.resource, document)) {
            authorityAccepted = false;
            findings.push(
              finding(
                'EOM_AUTHORITY_DESCRIPTOR_MISMATCH',
                'security',
                'The fetched resource identity does not match the resource descriptor declared by the root manifest.',
                {
                  severity: 'error',
                  resource: finalUrl,
                  related: [next.href, finalUrl],
                },
              ),
            );
          }
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
              {
                ...(options.now === undefined ? {} : { now: options.now }),
                observedRootUrl: rootResponse.finalUrl,
              },
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
            const enqueueResult = enqueueResources(
              document,
              next.depth + 1,
              queue,
              queued,
              maxDepth,
              Math.max(0, maxResources - fetchedResources),
              findings,
            );
            depthLimitReached ||= enqueueResult.depthLimitReached;
            if (enqueueResult.resourceLimitReached && !resourceLimitReported) {
              resourceLimitReported = true;
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
      if (depthLimitReached) {
        findings.push(
          finding(
            'EOM_GRAPH_DEPTH_LIMIT',
            'transport',
            `The publication graph exceeded the configured ${maxDepth}-level depth limit.`,
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
  readonly symlinkPaths: readonly string[];
  readonly symlinkLimitExceeded: boolean;
  readonly entryLimitExceeded: boolean;
}

async function publicationFiles(
  directory: string,
  maxFiles: number,
  maxDepth: number,
  maxEntries: number,
): Promise<PublicationFileWalk> {
  const result: string[] = [];
  const symlinkPaths: string[] = [];
  let symlinkCount = 0;
  let fileLimitExceeded = false;
  let depthLimitExceeded = false;
  let symlinkLimitExceeded = false;
  let entryCount = 0;
  let entryLimitExceeded = false;
  const recordSymlink = (path: string): boolean => {
    symlinkCount += 1;
    if (symlinkCount > maxFiles) {
      symlinkLimitExceeded = true;
      return true;
    }
    symlinkPaths.push(path);
    return false;
  };
  async function visit(current: string, depth: number): Promise<void> {
    if (fileLimitExceeded || entryLimitExceeded) return;
    if (depth > maxDepth) {
      depthLimitExceeded = true;
      return;
    }
    await assertStableDirectory(current);
    const entries: Dirent[] = [];
    const handle = await opendir(current);
    try {
      for await (const entry of handle) {
        entryCount += 1;
        if (entryCount > maxEntries) {
          entryLimitExceeded = true;
          return;
        }
        entries.push(entry);
      }
    } finally {
      await handle.close().catch(() => undefined);
    }
    entries.sort((left, right) => compareStrings(left.name, right.name));
    for (const entry of entries) {
      if (fileLimitExceeded || entryLimitExceeded) return;
      const path = join(current, entry.name);
      const information = await lstat(path);
      if (information.isSymbolicLink()) {
        if (recordSymlink(path)) return;
        continue;
      }
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build')
        continue;
      if (information.isDirectory()) {
        if (depth >= maxDepth) {
          depthLimitExceeded = true;
          continue;
        }
        await visit(path, depth + 1);
      } else if (
        information.isFile() &&
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
    symlinkPaths: symlinkPaths.sort(compareStrings),
    symlinkLimitExceeded,
    entryLimitExceeded,
  };
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function assertStableDirectory(path: string): Promise<void> {
  const information = await lstat(path);
  if (!information.isDirectory() || information.isSymbolicLink()) {
    throw new Error(`${path} is not a stable directory.`);
  }
  const actual = await realpath(path);
  if (normalizeFsPath(actual) !== normalizeFsPath(path)) {
    throw new Error(`${path} must not traverse a symbolic link.`);
  }
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

function positiveLimit(value: number | undefined, fallback: number, maximum: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? Math.min(Math.floor(value), maximum)
    : fallback;
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

function nonNegativeLimit(value: number | undefined, fallback: number, maximum: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0
    ? Math.min(Math.floor(value), maximum)
    : fallback;
}

interface EnqueueResourcesResult {
  readonly depthLimitReached: boolean;
  readonly resourceLimitReached: boolean;
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
  maxPendingResources: number,
  findings: Finding[],
): EnqueueResourcesResult {
  const resources = Array.isArray(document.resources) ? document.resources : [];
  if (resources.length === 0) return { depthLimitReached: false, resourceLimitReached: false };
  if (depth > maxDepth) return { depthLimitReached: true, resourceLimitReached: false };
  let resourceLimitReached = false;
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
    // Keep the complete descriptor in the queue identity. Two declarations can
    // intentionally share a transport URL and resource id/type while differing
    // in subjects, delegation, or another authority constraint. Collapsing those
    // entries would validate only the first authority decision.
    const key = `${canonical}|${resourceId}|${resourceType}|${stringifyCanonical(resource)}`;
    if (queued.has(key)) continue;
    if (queue.length >= maxPendingResources) {
      resourceLimitReached = true;
      break;
    }
    queued.add(key);
    queue.push({ href: resource.href, depth, resource });
  }
  return { depthLimitReached: false, resourceLimitReached };
}

function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  return url.toString();
}
