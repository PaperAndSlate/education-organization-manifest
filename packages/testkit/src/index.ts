import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import {
  fetchEom,
  fetchManifest,
  isJsonObject,
  parseStrictJson,
  type FetchOptions,
  type JsonObject,
} from '@paperandslate/eom-core';
import { lintPublication } from '@paperandslate/eom-linter';
import { hasErrors, validateDocument, type Finding } from '@paperandslate/eom-validator';
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
  };
  readonly consumerAdapter?: ConsumerAdapter;
  readonly fetch?: FetchOptions;
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

  const files = await readPublicationFiles(directory);
  const checks: ConformanceCheck[] = [];
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

  const parseable = files.filter((file) => {
    if (file.parseError) {
      addCheck('syntax', 'fail', file.parseError, file);
      return false;
    }
    addCheck('syntax', 'pass', 'Strict JSON parsing passed.', file);
    return true;
  });

  for (const file of parseable) {
    const result = validateDocument(file.document);
    if (result.valid) {
      addCheck('validation', 'pass', 'Structural and semantic validation passed.', file);
    } else {
      addCheck('validation', 'fail', describeFindings(result.findings), file);
    }
    const lintFindings = lintPublication(file.document);
    if (hasErrors(lintFindings)) {
      addCheck('privacy-policy', 'fail', describeFindings(lintFindings), file);
    } else if (lintFindings.some((finding) => finding.severity === 'warning')) {
      addCheck('privacy-policy', 'warn', describeFindings(lintFindings), file);
    } else {
      addCheck('privacy-policy', 'pass', 'Privacy and publication policy lint passed.', file);
    }
  }

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
        delegations.some((item) => isJsonObject(item) && item.status === 'active')
      );
    });
    addCheck(
      'delegation-record',
      delegated ? 'pass' : 'fail',
      delegated
        ? 'An active, non-transitive delegation record is present for review.'
        : 'The delegated profile requires an active delegation record.',
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
    if (signatureFile?.document && keySetFile?.document) {
      const subjectId =
        typeof signatureFile.document.subject === 'string'
          ? signatureFile.document.subject
          : undefined;
      const subjectFile = subjectId
        ? parseable.find((file) => file.document?.id === subjectId)
        : undefined;
      if (subjectFile?.document) {
        const verification = verifyDetached(
          subjectFile.document,
          signatureFile.document,
          keySetFile.document,
          { now: options.now ?? new Date() },
        );
        addCheck(
          'signature-cryptographic',
          verification.overall ? 'pass' : 'fail',
          verification.overall
            ? 'The detached Ed25519 signature verifies against the captured resource and key set.'
            : describeFindings(verification.findings),
          signatureFile,
        );
      } else {
        addCheck(
          'signature-subject',
          'fail',
          'The signed profile could not resolve the signature subject.',
        );
      }
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
    await appendPublisherChecks(options.origin, options.fetch, addCheck);
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
  addCheck: (
    kind: string,
    status: ConformanceCheckStatus,
    message: string,
    file?: PublicationFile,
  ) => void,
): Promise<void> {
  if (!origin) {
    addCheck('publisher-origin', 'fail', 'Publisher mode requires an origin.');
    return;
  }
  try {
    const response = await fetchManifest(origin, fetchOptions);
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
    const validation = validateDocument(response.document);
    addCheck(
      'publisher-manifest',
      validation.valid ? 'pass' : 'fail',
      validation.valid
        ? 'The publisher returned a valid root manifest.'
        : describeFindings(validation.findings),
    );
    addCheck(
      'publisher-redirects',
      response.redirects.length <= 5 ? 'pass' : 'fail',
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

async function readPublicationFiles(directory: string): Promise<readonly PublicationFile[]> {
  const information = await stat(directory);
  if (!information.isDirectory()) throw new Error(`${directory} is not a directory.`);
  const paths = await walkFiles(directory);
  const result: PublicationFile[] = [];
  for (const absolutePath of paths) {
    const relativePath = relative(directory, absolutePath).replaceAll('\\', '/');
    if (!isPublicationFile(relativePath)) continue;
    const bytes = await readFile(absolutePath);
    try {
      const parsed = parseStrictJson(bytes.toString('utf8'), relativePath);
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
  return result.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function walkFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await walkFiles(path)));
    else if (entry.isFile()) result.push(path);
  }
  return result.sort();
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
