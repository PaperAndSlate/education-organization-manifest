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
  const paths = await publicationFiles(root);
  const maxFiles = positiveLimit(options.maxFiles, 256);
  const maxBytes = positiveLimit(options.maxBytes, 10 * 1024 * 1024);
  const findings: Finding[] = [];
  const documents: Record<string, unknown> = {};
  const files = paths.slice(0, maxFiles).map((path) => relative(root, path).replaceAll('\\', '/'));
  if (paths.length > maxFiles) {
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
  for (const path of paths.slice(0, maxFiles)) {
    const name = relative(root, path).replaceAll('\\', '/');
    try {
      const bytes = await readFile(path);
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
      const document = parseStrictJson(bytes.toString('utf8'), path);
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
  try {
    const rootResponse = await fetchManifest(originOrUrl, options.fetch);
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
      const queued = new Set<string>();
      const cache = new Map<string, { readonly finalUrl: string; readonly document: unknown }>();
      cache.set(canonicalUrl(rootResponse.requestedUrl), {
        finalUrl: rootResponse.finalUrl,
        document: rootResponse.document,
      });
      cache.set(canonicalUrl(rootResponse.finalUrl), {
        finalUrl: rootResponse.finalUrl,
        document: rootResponse.document,
      });
      enqueueResources(rootResponse.document, 1, queue, queued, maxDepth);
      if (queue.length > maxResources) {
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
      while (queue.length > 0 && fetchedResources < maxResources) {
        const next = queue.shift();
        if (!next) break;
        fetchedResources += 1;
        try {
          const requestKey = canonicalUrl(next.href);
          const cached = cache.get(requestKey);
          let finalUrl: string;
          let document: unknown;
          if (cached) {
            finalUrl = cached.finalUrl;
            document = cached.document;
          } else {
            const response = await fetchEom(next.href, options.fetch);
            totalBytes += Buffer.byteLength(response.body, 'utf8');
            if (totalBytes > maxTotalBytes) {
              findings.push(
                finding(
                  'EOM_GRAPH_TOTAL_BYTES',
                  'transport',
                  `The publication graph exceeds the configured ${maxTotalBytes}-byte limit.`,
                  { resource: next.href, severity: 'error' },
                ),
              );
              break;
            }
            finalUrl = response.finalUrl;
            document = parseStrictJson(response.body, response.finalUrl);
            cache.set(requestKey, { finalUrl, document });
            cache.set(canonicalUrl(finalUrl), { finalUrl, document });
          }
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
      if (queue.length > 0) {
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

async function publicationFiles(directory: string): Promise<string[]> {
  const result: string[] = [];
  async function visit(current: string): Promise<void> {
    const entries = (await readdir(current, { withFileTypes: true })).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build')
        continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (
        entry.isFile() &&
        (entry.name === 'educational-organization-manifest' ||
          (entry.name.endsWith('.json') && !isGeneratedMetadata(entry.name)))
      ) {
        result.push(path);
      }
    }
  }
  await visit(directory);
  return result.sort((left, right) => left.localeCompare(right));
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
