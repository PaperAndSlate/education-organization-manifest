import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import {
  EomFetchError,
  fetchEom,
  fetchManifest,
  isJsonObject,
  parseStrictJson,
  type JsonObject,
  type FetchOptions,
} from '@paperandslate/eom-core';
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
}

export interface PublicationValidationResult {
  readonly valid: boolean;
  readonly structuralValid: boolean;
  readonly semanticValid: boolean;
  readonly findings: readonly Finding[];
  readonly documents: Readonly<Record<string, unknown>>;
  readonly files: readonly string[];
  readonly rootUrl?: string;
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
      const bytes = await readFile(path);
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
      if (bytes.byteLength > maxBytes) {
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
      const document = parseStrictJson(decodeUtf8(bytes, path), path);
      documents[name] = document;
      const result = validateDocument(document, options);
      findings.push(
        ...result.findings.map((item) => ({ ...item, resource: item.resource ?? name })),
      );
    } catch (error) {
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

/** Retrieve and validate a public manifest and its declared resource graph. */
export async function validatePublicationUrl(
  originOrUrl: string,
  options: PublicationValidationOptions = {},
): Promise<PublicationValidationResult> {
  const documents: Record<string, unknown> = {};
  const findings: Finding[] = [];
  let rootUrl: string | undefined;
  const files: string[] = [];
  const fetchOptions: FetchOptions = {
    ...options.fetch,
    ...(options.maxBytes !== undefined && options.fetch?.maxBytes === undefined
      ? { maxBytes: options.maxBytes }
      : {}),
  };
  try {
    const rootResponse = await fetchManifest(originOrUrl, fetchOptions);
    rootUrl = rootResponse.finalUrl;
    documents[rootResponse.finalUrl] = rootResponse.document;
    files.push(rootResponse.finalUrl);
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
      const queue: Array<{ readonly href: string; readonly depth: number }> = [];
      const queued = new Set<string>([
        canonicalUrl(rootResponse.requestedUrl),
        canonicalUrl(rootResponse.finalUrl),
      ]);
      const cache = new Map<
        string,
        { readonly finalUrl: string; readonly document: unknown; readonly bytes: number }
      >();
      let resourceLimitReported = false;
      let totalBytesLimitReached = totalBytes > maxTotalBytes;
      cache.set(canonicalUrl(rootResponse.requestedUrl), {
        finalUrl: rootResponse.finalUrl,
        document: rootResponse.document,
        bytes: totalBytes,
      });
      cache.set(canonicalUrl(rootResponse.finalUrl), {
        finalUrl: rootResponse.finalUrl,
        document: rootResponse.document,
        bytes: totalBytes,
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
      } else {
        enqueueResources(rootResponse.document, 1, queue, queued, maxDepth);
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
          if (cached) {
            finalUrl = cached.finalUrl;
            document = cached.document;
            responseBytes = cached.bytes;
          } else {
            const response = await fetchEom(next.href, fetchOptions);
            responseBytes = Buffer.byteLength(response.body, 'utf8');
            finalUrl = response.finalUrl;
            document = parseStrictJson(response.body, response.finalUrl);
            cache.set(requestKey, { finalUrl, document, bytes: responseBytes });
            cache.set(canonicalUrl(finalUrl), { finalUrl, document, bytes: responseBytes });
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
          const result = validateDocument(document, options);
          findings.push(
            ...result.findings.map((item) => ({
              ...item,
              resource: item.resource ?? finalUrl,
            })),
          );
          if (isJsonObject(document)) {
            enqueueResources(document, next.depth + 1, queue, queued, maxDepth);
          }
        } catch (error) {
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
    findings.push(fetchFinding(error, originOrUrl));
  }
  findings.push(
    ...publicationSetFindings(documents, options).map((item) => ({
      ...item,
      resource: item.resource ?? 'publication-set',
    })),
  );
  return {
    ...publicationResult(documents, files, findings),
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
  queue: Array<{ readonly href: string; readonly depth: number }>,
  queued: Set<string>,
  maxDepth: number,
): void {
  const resources = Array.isArray(document.resources) ? document.resources : [];
  if (resources.length === 0 || depth > maxDepth) return;
  for (const resource of resources) {
    if (!isJsonObject(resource) || typeof resource.href !== 'string') continue;
    const key = canonicalUrl(resource.href);
    if (queued.has(key)) continue;
    queued.add(key);
    queue.push({ href: resource.href, depth });
  }
}

function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  return url.toString();
}
