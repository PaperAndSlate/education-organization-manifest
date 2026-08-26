import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import {
  DEFAULT_FETCH_MAX_REDIRECTS,
  EomFetchError,
  fetchEom,
  fetchManifest,
  isJsonObject,
  parseStrictJson,
  type FetchOptions,
  type JsonObject,
} from '@paperandslate/eom-core';
import { evaluateAuthority } from '@paperandslate/eom-authority';
import { lintPublication } from '@paperandslate/eom-linter';
import {
  finding,
  hasErrors,
  publicationSetFindings,
  validateDocument,
  validatePublicationUrl,
  type Finding,
  type ValidationResult,
} from '@paperandslate/eom-validator';
import { verifyDetached } from '@paperandslate/eom-signatures';
export * from './publisher.js';

export const CONFORMANCE_SPECIFICATION = 'https://paperandslate.org/spec/eom/1.0';
export const CONFORMANCE_BASE_URI = `${CONFORMANCE_SPECIFICATION}/conformance`;

const CORE_PROFILE = {
  uri: `${CONFORMANCE_SPECIFICATION}/profiles/core-publisher`,
  role: 'publisher',
  description: 'Core publisher publication and resource graph checks.',
} as const;
const SIGNATURE_OPTIONAL_PROFILE = {
  uri: `${CONFORMANCE_SPECIFICATION}/profiles/signature-optional`,
  role: 'signature',
  description:
    'Optional signature metadata is checked when present; unsigned resources remain valid.',
} as const;

export const CONFORMANCE_PROFILES = {
  core: CORE_PROFILE,
  school: {
    uri: `${CONFORMANCE_SPECIFICATION}/profiles/school-publisher`,
    role: 'publisher',
    description: 'School publisher profile with identity, privacy, and public resource checks.',
  },
  district: {
    uri: `${CONFORMANCE_SPECIFICATION}/profiles/district-publisher`,
    role: 'publisher',
    description: 'District publisher profile with multiple organization relationships.',
  },
  module: {
    uri: `${CONFORMANCE_SPECIFICATION}/profiles/module`,
    role: 'module',
    description: 'Independently validatable module resource checks.',
  },
  delegated: {
    uri: `${CONFORMANCE_SPECIFICATION}/profiles/delegated-publisher`,
    role: 'publisher',
    description: 'Scoped cross-origin delegation checks.',
  },
  signed: {
    uri: `${CONFORMANCE_SPECIFICATION}/profiles/signed-publisher`,
    role: 'publisher',
    description: 'Detached signature and public key publication checks.',
  },
  consumer: {
    uri: `${CONFORMANCE_SPECIFICATION}/profiles/consumer`,
    role: 'consumer',
    description: 'Consumer discovery, graph, and safe-capture checks.',
  },
  generator: {
    uri: `${CONFORMANCE_SPECIFICATION}/profiles/generator`,
    role: 'generator',
    description: 'Generated-publication marker and reproducibility checks.',
  },
  validator: {
    uri: `${CONFORMANCE_SPECIFICATION}/profiles/validator`,
    role: 'validator',
    description: 'Structural, semantic, privacy, and expected-finding checks.',
  },
  'publisher-core': CORE_PROFILE,
  'consumer-core': {
    ...({
      uri: `${CONFORMANCE_SPECIFICATION}/profiles/consumer`,
      role: 'consumer',
      description: 'Consumer discovery, graph, and safe-capture checks.',
    } as const),
  },
  'signature-optional': SIGNATURE_OPTIONAL_PROFILE,
} as const;

const PROFILE_ALIASES: Readonly<Record<string, string>> = {
  'publisher-core': 'core',
  'consumer-core': 'consumer',
  'signature-optional': 'signature-optional',
};

export type ConformanceProfileName = keyof typeof CONFORMANCE_PROFILES;
export type ConformanceCheckStatus = 'pass' | 'fail' | 'skip' | 'warn';
export type ConformanceStatus = 'conforming' | 'partial' | 'non-conforming';

export interface ConformanceCheck {
  readonly id: string;
  readonly status: ConformanceCheckStatus;
  readonly message?: string;
  readonly evidence?: readonly string[];
}

export interface ConformanceReport {
  readonly $schema: 'https://paperandslate.org/schemas/eom/1.0/conformance-report.schema.json';
  readonly specification: typeof CONFORMANCE_SPECIFICATION;
  readonly version: '1.0';
  readonly id: string;
  readonly type: 'conformance-report';
  readonly canonical: string;
  readonly implementation: {
    readonly name: string;
    readonly version: string;
    readonly source?: string;
  };
  readonly status: ConformanceStatus;
  readonly profile: string;
  readonly checks: readonly ConformanceCheck[];
  readonly generatedAt?: string;
  readonly modified?: string;
}

export interface ConformanceOptions {
  readonly directory: string;
  readonly origin?: string;
  readonly profile?: ConformanceProfileName;
  readonly implementationName?: string;
  readonly implementationVersion?: string;
  readonly implementationSource?: string;
  readonly now?: Date;
  readonly mode?: 'fixture' | 'publisher' | 'consumer' | 'generator';
  readonly expected?: {
    readonly status?: ConformanceStatus;
    readonly checks?: Readonly<Record<string, ConformanceCheckStatus>>;
    readonly findingCodes?: readonly string[];
  };
  readonly consumerAdapter?: ConsumerAdapter;
  readonly fetch?: FetchOptions;
  readonly maxFiles?: number;
  readonly maxTotalBytes?: number;
  readonly maxDepth?: number;
}

export interface ConsumerObservation {
  readonly checks: readonly ConformanceCheck[];
  readonly notes?: readonly string[];
}

export interface ConsumerAdapter {
  readonly name: string;
  readonly version: string;
  run(
    directory: string,
    context: { readonly now: Date; readonly profile: ConformanceProfileName },
  ): Promise<ConsumerObservation>;
}

interface PublicationFile {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly bytes: Buffer;
  readonly document?: JsonObject;
  readonly parseError?: string;
}

const REPORT_SCHEMA =
  'https://paperandslate.org/schemas/eom/1.0/conformance-report.schema.json' as const;
const DEFAULT_IMPLEMENTATION_NAME = '@paperandslate/eom-testkit';
const DEFAULT_IMPLEMENTATION_VERSION = '1.0.0-rc.2';

/**
 * Runs a deterministic, offline conformance check over a captured publication directory.
 * The runner never fetches hrefs: linked-resource checks resolve only to files in the supplied
 * directory. This keeps fixture and CI runs safe while leaving live publisher/consumer tests to
 * the separately packaged pilot harness.
 */
export async function runConformance(options: ConformanceOptions): Promise<ConformanceReport> {
  const directory = resolve(options.directory);
  const profile = options.profile ?? 'publisher-core';
  const profileDefinition = CONFORMANCE_PROFILES[profile];
  if (!profileDefinition) {
    throw new Error(
      `Unknown conformance profile ${String(profile)}. Supported profiles: ${Object.keys(CONFORMANCE_PROFILES).join(', ')}`,
    );
  }
  const profileName = (PROFILE_ALIASES[profile] ?? profile) as ConformanceProfileName;

  const capture = await readPublicationFiles(
    directory,
    positiveLimit(options.maxFiles, 256),
    positiveLimit(options.maxTotalBytes, 32 * 1024 * 1024),
    nonNegativeLimit(options.maxDepth, 32),
  );
  const files = capture.files;
  const checks: ConformanceCheck[] = [];
  const observedFindingCodes = new Set<string>();
  const validationByPath = new Map<string, ValidationResult>();
  const evidenceFor = (file?: PublicationFile): readonly string[] =>
    file ? [evidenceUri(file.relativePath)] : [];
  const addCheck = (
    kind: string,
    status: ConformanceCheckStatus,
    message: string,
    file?: PublicationFile,
  ): void => {
    checks.push({
      id: checkUri(kind, file?.relativePath),
      status,
      message,
      ...(file ? { evidence: evidenceFor(file) } : {}),
    });
  };

  if (files.length === 0) {
    addCheck('publication-files', 'fail', 'No JSON publication files were found in the capture.');
  }
  if (capture.fileLimitExceeded) {
    addCheck('capture-file-limit', 'fail', 'The capture exceeded the configured file limit.');
  }
  if (capture.totalBytesExceeded) {
    addCheck('capture-byte-limit', 'fail', 'The capture exceeded the configured byte limit.');
  }
  if (capture.depthLimitExceeded) {
    addCheck('capture-depth-limit', 'fail', 'The capture exceeded the configured depth limit.');
  }

  const parseable = files.filter((file) => {
    if (file.parseError) {
      addCheck('syntax', 'fail', file.parseError, file);
      return false;
    }
    addCheck('syntax', 'pass', 'Strict JSON parsing passed.', file);
    return true;
  });

  for (const file of parseable) {
    const result = validateDocument(
      file.document,
      options.now === undefined ? {} : { now: options.now },
    );
    validationByPath.set(file.relativePath, result);
    if (result.valid) {
      addCheck('validation', 'pass', 'Structural and semantic validation passed.', file);
    } else {
      addCheck('validation', 'fail', describeFindings(result.findings), file);
    }
    for (const item of result.findings) observedFindingCodes.add(item.code);
    const lintFindings = lintPublication(
      file.document,
      options.now === undefined ? {} : { now: options.now },
    );
    for (const item of lintFindings) observedFindingCodes.add(item.code);
    if (hasErrors(lintFindings)) {
      addCheck('privacy-policy', 'fail', describeFindings(lintFindings), file);
    } else if (lintFindings.some((finding) => finding.severity === 'warning')) {
      addCheck('privacy-policy', 'warn', describeFindings(lintFindings), file);
    } else {
      addCheck('privacy-policy', 'pass', 'Privacy and publication policy lint passed.', file);
    }
  }

  const captureDocuments: Record<string, unknown> = {};
  for (const file of parseable) {
    if (file.document) captureDocuments[file.relativePath] = file.document;
  }
  const publicationFindings = publicationSetFindings(
    captureDocuments,
    options.now === undefined ? {} : { now: options.now },
  );
  for (const item of publicationFindings) observedFindingCodes.add(item.code);
  addCheck(
    'publication-set',
    hasErrors(publicationFindings)
      ? 'fail'
      : publicationFindings.some((item) => item.severity === 'warning')
        ? 'warn'
        : 'pass',
    publicationFindings.length === 0
      ? 'Cross-document references, identifiers, and publication-set semantics passed.'
      : describeFindings(publicationFindings),
  );

  const manifests = parseable.filter((file) => file.document?.type === 'manifest');
  const distinctManifests = distinctByBytes(manifests);
  const moduleResources = parseable.filter(
    (file) => file.document?.type !== 'manifest' && file.document?.type !== undefined,
  );
  if (['core', 'school', 'district', 'consumer', 'generator'].includes(profileName)) {
    if (distinctManifests.length === 0) {
      addCheck(
        'profile-manifest',
        'fail',
        `${profileDefinition.role} profile requires one manifest.`,
      );
    } else {
      addCheck(
        'profile-manifest',
        distinctManifests.length === 1 ? 'pass' : 'fail',
        distinctManifests.length === 1
          ? `One root manifest is present (${manifests.length} identical capture path(s)).`
          : 'A capture must contain exactly one distinct root manifest.',
        distinctManifests[0],
      );
      const manifest = distinctManifests[0]?.document;
      const hasOrganization = moduleResources.some(
        (file) =>
          file.document?.type === 'organization-profile' ||
          file.document?.type === 'organization-index',
      );
      if (hasOrganization) {
        addCheck(
          'profile-organization',
          'pass',
          'An organization profile or index is present.',
          distinctManifests[0],
        );
      } else {
        addCheck(
          'profile-organization',
          'fail',
          'The core profile requires an organization profile or index.',
        );
      }
      if (manifest) {
        const linked = checkLocalLinks(manifest, directory, files);
        addCheck(
          'resource-graph',
          linked.length === 0 ? 'pass' : 'fail',
          linked.length === 0
            ? 'Manifest resource links resolve inside the captured publication directory.'
            : linked.join(' '),
          distinctManifests[0],
        );
      }
      if (profileName === 'school') {
        const school = moduleResources.some((file) => {
          const organization = file.document;
          return (
            organization?.type === 'organization-profile' &&
            (organization.organizationType === 'secondary-school' ||
              organization.organizationType === 'school')
          );
        });
        addCheck(
          'school-identity',
          school ? 'pass' : 'fail',
          school
            ? 'A school organization profile is present.'
            : 'The school profile requires a school organization profile.',
        );
      }
      if (profileName === 'district') {
        const district = manifests.some(
          (file) =>
            Array.isArray(file.document?.organizations) && file.document.organizations.length >= 2,
        );
        addCheck(
          'district-organizations',
          district ? 'pass' : 'fail',
          district
            ? 'The root exposes at least two organizations for district publication.'
            : 'The district profile requires at least two organizations in the root manifest.',
        );
      }
      if (profileName === 'consumer') {
        addCheck(
          'consumer-capture',
          files.every((file) => file.parseError === undefined) ? 'pass' : 'fail',
          'The consumer profile processed a strict local capture without following untrusted links.',
        );
      }
      if (profileName === 'generator') {
        const generated = await generatedMetadata(directory);
        addCheck(
          'generator-marker',
          generated.marker ? 'pass' : 'fail',
          generated.marker
            ? 'The publication is marked as generator-owned.'
            : 'Generated publications must contain .eom-generated.json.',
        );
        addCheck(
          'generator-reproducibility',
          generated.reproducibility ? 'pass' : 'fail',
          generated.reproducibility
            ? 'A reproducibility report is present.'
            : 'Generated publications must include a reproducibility report.',
        );
      }
    }
  } else if (profileName === 'module') {
    if (moduleResources.length === 0) {
      addCheck(
        'module-resource',
        'fail',
        'The module profile requires at least one typed resource.',
      );
    } else {
      addCheck(
        'module-resource',
        'pass',
        `${moduleResources.length} independently typed resource(s) are present.`,
      );
    }
    const moduleSchemaValid =
      moduleResources.length > 0 &&
      moduleResources.every((file) => validationByPath.get(file.relativePath)?.valid === true);
    addCheck(
      'module-schema',
      moduleSchemaValid ? 'pass' : 'fail',
      moduleSchemaValid
        ? 'Every captured module resource passed its registered schema and semantic checks.'
        : 'Every captured module resource must pass its registered schema and semantic checks.',
    );
  } else if (profileName === 'validator') {
    addCheck(
      'validator-engine',
      parseable.length === files.length && files.length > 0 ? 'pass' : 'fail',
      'The bundled validator processed every parseable capture file.',
    );
  } else if (profileName === 'signature-optional') {
    const signingFiles = parseable.filter(
      (file) => file.document?.type === 'key-set' || file.document?.signing,
    );
    addCheck(
      'optional-signatures',
      'pass',
      signingFiles.length === 0
        ? 'No signature metadata is present; signatures are optional in EOM 1.0.'
        : `${signingFiles.length} signature/key-set document(s) were structurally checked.`,
    );
  } else if (profileName === 'delegated') {
    const delegated = manifests.some((file) => {
      const delegations = file.document?.delegations;
      return (
        Array.isArray(delegations) &&
        delegations.some(
          (item) => isJsonObject(item) && item.status === 'active' && item.transitive === false,
        )
      );
    });
    addCheck(
      'delegation-record',
      delegated ? 'pass' : 'fail',
      delegated
        ? 'An active, non-transitive delegation record is present for review.'
        : 'The delegated profile requires an active delegation record.',
    );
    const authorityFindings: Finding[] = [];
    let authorityChecks = 0;
    for (const manifestFile of distinctManifests) {
      const manifest = manifestFile.document;
      if (!manifest || !Array.isArray(manifest.resources)) continue;
      for (const resource of manifest.resources) {
        if (!isJsonObject(resource) || typeof resource.href !== 'string') continue;
        authorityChecks += 1;
        const authority = evaluateAuthority(manifest, resource, resource.href, {
          now: options.now ?? new Date(),
        });
        authorityFindings.push(...authority.findings);
      }
    }
    for (const item of authorityFindings) observedFindingCodes.add(item.code);
    addCheck(
      'delegation-authority',
      authorityChecks > 0 && !hasErrors(authorityFindings) ? 'pass' : 'fail',
      authorityChecks === 0
        ? 'The delegated profile did not find a manifest resource to evaluate.'
        : authorityFindings.length === 0
          ? 'Every manifest resource is covered by root or explicitly delegated authority.'
          : describeFindings(authorityFindings),
    );
  } else if (profileName === 'signed') {
    const signatureFile = parseable.find((file) => file.document?.type === 'signature');
    const keySetFile = parseable.find((file) => file.document?.type === 'key-set');
    const signed =
      signatureFile !== undefined || parseable.some((file) => isJsonObject(file.document?.signing));
    addCheck(
      'signature-record',
      signed ? 'pass' : 'fail',
      signed
        ? 'Signature metadata is present for the signed profile.'
        : 'The signed profile requires signature metadata.',
    );
    const subjectId =
      typeof signatureFile?.document?.subject === 'string'
        ? signatureFile.document.subject
        : undefined;
    const subjectFile = subjectId
      ? parseable.find((file) => file.document?.id === subjectId)
      : undefined;
    addCheck(
      'signature-subject',
      subjectFile?.document ? 'pass' : 'fail',
      subjectFile?.document
        ? 'The detached signature subject resolves to a captured resource.'
        : 'The signed profile could not resolve the signature subject.',
      signatureFile,
    );
    if (signatureFile?.document && keySetFile?.document && subjectFile?.document) {
      const manifest = distinctManifests[0]?.document;
      const signedResourceUrl =
        manifest && Array.isArray(manifest.resources)
          ? manifest.resources.find(
              (resource): resource is JsonObject =>
                isJsonObject(resource) &&
                subjectId !== undefined &&
                Array.isArray(resource.subjects) &&
                resource.subjects.includes(subjectId),
            )
          : undefined;
      const verification = verifyDetached(
        subjectFile.document,
        signatureFile.document,
        keySetFile.document,
        {
          now: options.now ?? new Date(),
          ...(manifest && signedResourceUrl && typeof signedResourceUrl.href === 'string'
            ? { manifest, resource: subjectFile.document, finalUrl: signedResourceUrl.href }
            : {}),
        },
      );
      for (const item of verification.findings) observedFindingCodes.add(item.code);
      addCheck(
        'signature-cryptographic',
        verification.overall ? 'pass' : 'fail',
        verification.overall
          ? 'The detached Ed25519 signature verifies against the captured resource, key set, and authority context.'
          : describeFindings(verification.findings),
        signatureFile,
      );
    } else {
      addCheck(
        'signature-cryptographic',
        'fail',
        'The signed profile requires a captured signature, key set, and signature subject resource.',
        signatureFile,
      );
    }
  }

  if (options.consumerAdapter && (profileName === 'consumer' || options.mode === 'consumer')) {
    const observation = await options.consumerAdapter.run(directory, {
      now: options.now ?? new Date(),
      profile,
    });
    checks.push(...observation.checks);
    for (const note of observation.notes ?? []) addCheck('consumer-note', 'warn', note);
  }
  if (options.origin || options.mode === 'publisher') {
    await appendPublisherChecks(options.origin, options.fetch, options.now, addCheck, {
      maxResources: positiveLimit(options.maxFiles, 64),
      maxTotalBytes: positiveLimit(options.maxTotalBytes, 32 * 1024 * 1024),
      maxDepth: nonNegativeLimit(options.maxDepth, 32),
    });
  }
  if (options.expected) {
    const actualStatus = statusFor(checks);
    if (options.expected.status) {
      addCheck(
        'expected-status',
        actualStatus === options.expected.status ? 'pass' : 'fail',
        `Expected ${options.expected.status}; observed ${actualStatus}.`,
      );
    }
    for (const [id, expectedStatus] of Object.entries(options.expected.checks ?? {})) {
      const actual = checks.find(
        (check) => check.id.endsWith(`/checks/${id}`) || check.id === id,
      )?.status;
      addCheck(
        `expected-check-${id}`,
        actual === expectedStatus ? 'pass' : 'fail',
        `Expected check ${id} to be ${expectedStatus}; observed ${actual ?? 'missing'}.`,
      );
    }
    for (const code of options.expected.findingCodes ?? []) {
      addCheck(
        `expected-finding-${code}`,
        observedFindingCodes.has(code) ? 'pass' : 'fail',
        observedFindingCodes.has(code)
          ? `Expected finding code ${code} was observed.`
          : `Expected finding code ${code} was not observed.`,
      );
    }
  }

  const fingerprint = fingerprintFor(files);
  const generatedAt = options.now?.toISOString();
  const report: ConformanceReport = {
    $schema: REPORT_SCHEMA,
    specification: CONFORMANCE_SPECIFICATION,
    version: '1.0',
    id: `${CONFORMANCE_BASE_URI}/reports/${fingerprint}`,
    type: 'conformance-report',
    canonical: `${CONFORMANCE_BASE_URI}/reports/${fingerprint}`,
    implementation: {
      name: options.implementationName ?? DEFAULT_IMPLEMENTATION_NAME,
      version: options.implementationVersion ?? DEFAULT_IMPLEMENTATION_VERSION,
      ...(options.implementationSource ? { source: options.implementationSource } : {}),
    },
    status: statusFor(checks),
    profile: profileDefinition.uri,
    checks,
    ...(generatedAt ? { generatedAt, modified: generatedAt } : {}),
  };
  return report;
}

async function appendPublisherChecks(
  origin: string | undefined,
  fetchOptions: FetchOptions | undefined,
  now: Date | undefined,
  addCheck: (
    kind: string,
    status: ConformanceCheckStatus,
    message: string,
    file?: PublicationFile,
  ) => void,
  graphLimits: FixtureGraphLimits,
): Promise<void> {
  if (!origin) {
    addCheck('publisher-origin', 'fail', 'Publisher mode requires an origin.');
    return;
  }
  try {
    const response = await fetchManifest(origin, { ...fetchOptions, method: 'GET' });
    const maxRedirects =
      fetchOptions?.maxRedirects === undefined
        ? DEFAULT_FETCH_MAX_REDIRECTS
        : Math.max(0, Math.floor(fetchOptions.maxRedirects));
    addCheck(
      'publisher-discovery',
      response.status === 200 ? 'pass' : 'fail',
      `Discovery returned HTTP ${response.status}.`,
    );
    addCheck(
      'publisher-content-type',
      response.contentType?.toLowerCase().startsWith('application/json') === true ? 'pass' : 'fail',
      response.contentType
        ? `Discovery content type is ${response.contentType}.`
        : 'Discovery did not return a content type.',
    );
    const validation = validateDocument(response.document, now === undefined ? {} : { now });
    addCheck(
      'publisher-manifest',
      validation.valid ? 'pass' : 'fail',
      validation.valid
        ? 'The publisher returned a valid root manifest.'
        : describeFindings(validation.findings),
    );
    addCheck(
      'publisher-redirects',
      response.redirects.length <= maxRedirects ? 'pass' : 'fail',
      `Discovery recorded ${response.redirects.length} redirect hop(s).`,
    );
    const head = await fetchEom(response.finalUrl, { ...fetchOptions, method: 'HEAD' });
    addCheck(
      'publisher-head',
      head.status === 200 && head.contentType?.toLowerCase().startsWith('application/json') === true
        ? 'pass'
        : 'fail',
      `HEAD returned HTTP ${head.status} with ${head.contentType ?? 'no content type'}.`,
    );
    const graph = isLoopbackPublisherOrigin(origin)
      ? await validateFixturePublisherGraph(
          origin,
          response.document,
          fetchOptions,
          now,
          graphLimits,
        )
      : await validatePublicationUrl(origin, {
          fetchGraph: true,
          maxResources: graphLimits.maxResources,
          maxTotalBytes: graphLimits.maxTotalBytes,
          maxDepth: graphLimits.maxDepth,
          ...(now === undefined ? {} : { now }),
          ...(fetchOptions ? { fetch: { ...fetchOptions, method: 'GET' } } : {}),
        });
    addCheck(
      'publisher-graph',
      graph.valid ? 'pass' : 'fail',
      graph.valid
        ? `The publisher resource graph validated with ${graph.files.length} fetched document(s).`
        : describeFindings(graph.findings),
    );
  } catch (error) {
    addCheck('publisher-discovery', 'fail', error instanceof Error ? error.message : String(error));
  }
}

export function isConformanceProfileName(value: string): value is ConformanceProfileName {
  return Object.hasOwn(CONFORMANCE_PROFILES, value);
}

export function conformanceReportSummary(report: ConformanceReport): Record<string, unknown> {
  const counts = { pass: 0, fail: 0, skip: 0, warn: 0 };
  for (const check of report.checks) counts[check.status] += 1;
  return {
    status: report.status,
    profile: report.profile,
    implementation: report.implementation,
    checks: counts,
    reportId: report.id,
  };
}

interface PublicationFileRead {
  readonly files: readonly PublicationFile[];
  readonly fileLimitExceeded: boolean;
  readonly totalBytesExceeded: boolean;
  readonly depthLimitExceeded: boolean;
}

async function readPublicationFiles(
  directory: string,
  maxFiles: number,
  maxTotalBytes: number,
  maxDepth: number,
): Promise<PublicationFileRead> {
  const information = await stat(directory);
  if (!information.isDirectory()) throw new Error(`${directory} is not a directory.`);
  const result: PublicationFile[] = [];
  let fileLimitExceeded = false;
  let totalBytesExceeded = false;
  let depthLimitExceeded = false;
  let totalBytes = 0;
  async function visit(current: string, depth: number): Promise<void> {
    if (fileLimitExceeded || totalBytesExceeded) return;
    if (depth > maxDepth) {
      depthLimitExceeded = true;
      return;
    }
    const entries = (await readdir(current, { withFileTypes: true })).sort((left, right) =>
      compareStrings(left.name, right.name),
    );
    for (const entry of entries) {
      if (fileLimitExceeded || totalBytesExceeded) return;
      const absolutePath = join(current, entry.name);
      if (entry.isDirectory()) {
        if (depth >= maxDepth) {
          depthLimitExceeded = true;
          continue;
        }
        await visit(absolutePath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const relativePath = relative(directory, absolutePath).replaceAll('\\', '/');
      if (!isPublicationFile(relativePath)) continue;
      if (result.length >= maxFiles) {
        fileLimitExceeded = true;
        return;
      }
      const fileInformation = await stat(absolutePath);
      if (totalBytes + fileInformation.size > maxTotalBytes) {
        totalBytesExceeded = true;
        return;
      }
      const bytes = await readFile(absolutePath);
      totalBytes += bytes.byteLength;
      try {
        const parsed = parseStrictJson(decodeUtf8(bytes, relativePath), relativePath);
        result.push({
          absolutePath,
          relativePath,
          bytes,
          ...(isJsonObject(parsed)
            ? { document: parsed }
            : { parseError: 'The publication document must be a JSON object.' }),
        });
      } catch (error) {
        result.push({
          absolutePath,
          relativePath,
          bytes,
          parseError: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  await visit(directory, 0);
  return {
    files: result.sort((left, right) => compareStrings(left.relativePath, right.relativePath)),
    fileLimitExceeded,
    totalBytesExceeded,
    depthLimitExceeded,
  };
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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

function positiveLimit(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function nonNegativeLimit(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function isPublicationFile(path: string): boolean {
  const name = path.split('/').at(-1) ?? path;
  if (
    new Set([
      '.eom-generated.json',
      'input-manifest.json',
      'output-manifest.json',
      'validation.json',
      'lint.json',
      'source-map.json',
      'reproducibility.json',
      'build-report.json',
    ]).has(name)
  ) {
    return false;
  }
  return name === 'educational-organization-manifest' || name.endsWith('.json');
}

async function generatedMetadata(
  directory: string,
): Promise<{ marker: boolean; reproducibility: boolean }> {
  const candidates = [directory, join(directory, '..'), join(directory, '..', 'build')];
  const has = async (name: string): Promise<boolean> => {
    for (const candidate of candidates) {
      try {
        const information = await stat(join(candidate, name));
        if (information.isFile()) return true;
      } catch {
        // Continue through the supported generated-output layouts.
      }
    }
    return false;
  };
  return {
    marker: await has('.eom-generated.json'),
    reproducibility: await has('reproducibility.json'),
  };
}

function checkLocalLinks(
  manifest: JsonObject,
  directory: string,
  files: readonly PublicationFile[],
): string[] {
  const resources = Array.isArray(manifest.resources) ? manifest.resources : [];
  const available = new Set(files.map((file) => file.relativePath));
  const origin =
    isJsonObject(manifest.scope) && typeof manifest.scope.origin === 'string'
      ? manifest.scope.origin
      : undefined;
  const problems: string[] = [];
  for (const resource of resources) {
    if (!isJsonObject(resource) || typeof resource.href !== 'string') continue;
    let path: string;
    try {
      const url = new URL(resource.href);
      if (origin && new URL(origin).origin !== url.origin) continue;
      path = decodeURIComponent(url.pathname).replace(/^\//u, '');
    } catch {
      problems.push(`Invalid resource href ${String(resource.href)}.`);
      continue;
    }
    if (!available.has(path)) {
      const absoluteCandidate = resolve(directory, path);
      problems.push(`Missing captured resource ${path} (${absoluteCandidate}).`);
    }
  }
  return problems;
}

function fingerprintFor(files: readonly PublicationFile[]): string {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update('\0');
    hash.update(file.bytes);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function distinctByBytes(files: readonly PublicationFile[]): PublicationFile[] {
  const seen = new Set<string>();
  return files.filter((file) => {
    const digest = createHash('sha256').update(file.bytes).digest('hex');
    if (seen.has(digest)) return false;
    seen.add(digest);
    return true;
  });
}

function checkUri(kind: string, relativePath?: string): string {
  const suffix = relativePath ? `${kind}/${encodeURIComponent(relativePath)}` : kind;
  return `${CONFORMANCE_BASE_URI}/checks/${suffix}`;
}

function evidenceUri(relativePath: string): string {
  return `${CONFORMANCE_BASE_URI}/evidence/${encodeURIComponent(relativePath)}`;
}

function statusFor(checks: readonly ConformanceCheck[]): ConformanceStatus {
  if (checks.some((check) => check.status === 'fail')) return 'non-conforming';
  if (checks.some((check) => check.status === 'warn' || check.status === 'skip')) return 'partial';
  return 'conforming';
}

function describeFindings(findings: readonly Finding[]): string {
  if (findings.length === 0) return 'No findings.';
  return findings
    .slice(0, 5)
    .map(
      (finding) =>
        `${finding.code}${finding.pointer ? ` at ${finding.pointer}` : ''}: ${finding.message}`,
    )
    .join(' ');
}

interface FixtureGraphResult {
  readonly valid: boolean;
  readonly files: readonly string[];
  readonly findings: readonly Finding[];
}

interface FixtureGraphLimits {
  readonly maxResources: number;
  readonly maxTotalBytes: number;
  readonly maxDepth: number;
}

/**
 * A local fixture publisher cannot bind the fictional HTTPS origins embedded in its
 * documents. It therefore maps only URL paths onto the explicitly supplied loopback
 * server while still exercising the complete HTTP retrieval, redirect, media-type, and
 * publication-set validation path. Real publisher origins use validatePublicationUrl above.
 */
async function validateFixturePublisherGraph(
  publisherOrigin: string,
  root: unknown,
  fetchOptions: FetchOptions | undefined,
  now: Date | undefined,
  limits: FixtureGraphLimits,
): Promise<FixtureGraphResult> {
  const findings: Finding[] = [];
  const documents: Record<string, unknown> = {};
  const queue: Array<{ readonly href: string; readonly depth: number }> = [];
  const queued = new Set<string>();
  const files: string[] = [];
  let totalBytes = 0;
  if (isJsonObject(root)) {
    const rootUrl = `${publisherOrigin}/.well-known/educational-organization-manifest`;
    documents[rootUrl] = root;
    files.push(rootUrl);
    totalBytes = Buffer.byteLength(JSON.stringify(root), 'utf8');
  }
  let fetched = 0;
  let resourceLimit = false;
  let depthLimit = false;
  let totalBytesLimit = totalBytes > limits.maxTotalBytes;
  const rootEnqueue = isJsonObject(root)
    ? enqueueFixtureResources(root, 1, queue, queued, limits.maxDepth, limits.maxResources)
    : { resourceLimitExceeded: false, depthLimitExceeded: false };
  resourceLimit ||= rootEnqueue.resourceLimitExceeded;
  depthLimit ||= rootEnqueue.depthLimitExceeded;
  if (totalBytesLimit) {
    findings.push(
      finding(
        'EOM_GRAPH_TOTAL_BYTES',
        'transport',
        `The fixture publisher graph exceeds the ${limits.maxTotalBytes}-byte limit.`,
        { resource: publisherOrigin, severity: 'error' },
      ),
    );
  }
  while (queue.length > 0 && fetched < limits.maxResources && !totalBytesLimit) {
    const next = queue.shift();
    if (!next) break;
    fetched += 1;
    try {
      const localUrl = mapFixtureUrl(publisherOrigin, next.href);
      const response = await fetchEom(localUrl, { ...fetchOptions, method: 'GET' });
      const responseBytes = Buffer.byteLength(response.body, 'utf8');
      if (totalBytes + responseBytes > limits.maxTotalBytes) {
        findings.push(
          finding(
            'EOM_GRAPH_TOTAL_BYTES',
            'transport',
            `The fixture publisher graph exceeds the ${limits.maxTotalBytes}-byte limit.`,
            { resource: next.href, severity: 'error' },
          ),
        );
        totalBytesLimit = true;
        continue;
      }
      totalBytes += responseBytes;
      const document = parseStrictJson(response.body, response.finalUrl);
      documents[response.finalUrl] = document;
      files.push(response.finalUrl);
      const validation = validateDocument(document, now === undefined ? {} : { now });
      findings.push(
        ...validation.findings.map((item) => ({
          ...item,
          resource: item.resource ?? next.href,
        })),
      );
      if (isJsonObject(document)) {
        const enqueueResult = enqueueFixtureResources(
          document,
          next.depth + 1,
          queue,
          queued,
          limits.maxDepth,
          limits.maxResources,
        );
        resourceLimit ||= enqueueResult.resourceLimitExceeded;
        depthLimit ||= enqueueResult.depthLimitExceeded;
      }
    } catch (error) {
      findings.push(
        finding(
          error instanceof EomFetchError ? error.code : 'EOM_FETCH_NETWORK',
          'transport',
          error instanceof Error ? error.message : 'The fixture publisher graph request failed.',
          { resource: next.href },
        ),
      );
    }
  }
  if (depthLimit) {
    findings.push(
      finding(
        'EOM_GRAPH_DEPTH_LIMIT',
        'transport',
        `The fixture publisher graph exceeded the ${limits.maxDepth}-level depth limit.`,
        { resource: publisherOrigin, severity: 'error' },
      ),
    );
  }
  if ((queue.length > 0 || resourceLimit) && !totalBytesLimit) {
    findings.push(
      finding(
        'EOM_GRAPH_RESOURCE_LIMIT',
        'transport',
        `The fixture publisher graph exceeded the ${limits.maxResources}-resource limit.`,
        { resource: publisherOrigin, severity: 'error' },
      ),
    );
  }
  findings.push(
    ...publicationSetFindings(documents, now === undefined ? {} : { now }).map((item) => ({
      ...item,
      resource: item.resource ?? 'publication-set',
    })),
  );
  return { valid: !hasErrors(findings), files, findings };
}

function enqueueFixtureResources(
  document: JsonObject,
  depth: number,
  queue: Array<{ readonly href: string; readonly depth: number }>,
  queued: Set<string>,
  maxDepth: number,
  maxResources: number,
): { resourceLimitExceeded: boolean; depthLimitExceeded: boolean } {
  if (depth > maxDepth) return { resourceLimitExceeded: false, depthLimitExceeded: true };
  const resources = Array.isArray(document.resources) ? document.resources : [];
  let resourceLimitExceeded = false;
  for (const resource of resources) {
    if (!isJsonObject(resource) || typeof resource.href !== 'string') continue;
    let key: string;
    try {
      const url = new URL(resource.href);
      url.hash = '';
      key = url.toString();
    } catch {
      continue;
    }
    if (queued.has(key)) continue;
    if (queue.length >= maxResources) {
      resourceLimitExceeded = true;
      continue;
    }
    queued.add(key);
    queue.push({ href: resource.href, depth });
  }
  return { resourceLimitExceeded, depthLimitExceeded: false };
}

function mapFixtureUrl(publisherOrigin: string, href: string): string {
  const source = new URL(href);
  const target = new URL(publisherOrigin);
  target.pathname = source.pathname;
  target.search = source.search;
  target.hash = '';
  return target.toString();
}

function isLoopbackPublisherOrigin(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'http:' && (parsed.hostname === '127.0.0.1' || parsed.hostname === '::1')
    );
  } catch {
    return false;
  }
}
