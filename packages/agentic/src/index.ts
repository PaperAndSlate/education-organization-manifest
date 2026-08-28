import { createHash } from 'node:crypto';
import {
  isJsonObject,
  parseStrictJson,
  stableJsonValue,
  stringifyCanonical,
  type JsonObject,
  type JsonValue,
} from '@paperandslate/eom-core';
import { lintPublication } from '@paperandslate/eom-linter';
import { finding, type Finding } from '@paperandslate/eom-core/findings';

export type CandidateStatus =
  | 'discovered'
  | 'extracted'
  | 'normalized'
  | 'validation-failed'
  | 'review-ready'
  | 'changes-requested'
  | 'approved'
  | 'generated'
  | 'release-approved'
  | 'published'
  | 'superseded';

export type ClaimMethod =
  'direct-extraction' | 'normalize' | 'mapping' | 'inference' | 'human-input';

export type ReviewState = 'pending' | 'changes-requested' | 'approved' | 'rejected' | 'quarantined';

export interface CandidateGate {
  readonly allowed: boolean;
  readonly reasons: readonly string[];
  readonly claimCount: number;
  readonly unresolvedConflictCount: number;
  readonly privacyStatus: 'pending' | 'clear' | 'blocked' | 'quarantined';
}

export interface CandidateGateOptions {
  readonly now?: Date;
}

export interface CoverageReport {
  readonly resourceId?: string;
  readonly claimCount: number;
  readonly coveredPointers: readonly string[];
  readonly uncoveredPointers: readonly string[];
  readonly valid: boolean;
  readonly findings: readonly Finding[];
}

export interface PrivacyReviewReport {
  readonly status: 'clear' | 'blocked' | 'quarantined';
  readonly findings: readonly Finding[];
  readonly redactedPaths: readonly string[];
  readonly reportContainsSensitiveValues: false;
}

export interface StalenessOptions {
  readonly now?: Date;
  readonly maxAgeDays?: number;
}

export interface Recommendation {
  readonly recommendedClaimId?: string;
  readonly preservedClaimIds: readonly string[];
  readonly reason: string;
}

export interface ReviewReport {
  readonly candidateId?: string;
  readonly status?: CandidateStatus;
  readonly publication: 'blocked' | 'release-approved';
  readonly sourceCount: number;
  readonly claimCount: number;
  readonly methodCounts: Readonly<Record<string, number>>;
  readonly authorityCounts: Readonly<Record<string, number>>;
  readonly confidence: {
    readonly minimum?: number;
    readonly maximum?: number;
    readonly average?: number;
  };
  readonly unresolvedConflictIds: readonly string[];
  readonly privacy: PrivacyReviewReport;
  readonly requiredReviewStates: readonly ReviewState[];
  readonly changedResources: readonly string[];
  readonly noSensitiveValues: true;
}

export type ControlledSourceType =
  | 'organization-publication'
  | 'organization-website'
  | 'organization-api'
  | 'government-registry'
  | 'government-statistical-dataset'
  | 'standards-body'
  | 'vendor-authorized-feed'
  | 'human-submission'
  | 'agent-extraction'
  | 'foundation-derived'
  | 'mirror'
  | 'unknown';

export type ControlledSourceFormat = 'html' | 'markdown' | 'plain-text' | 'json' | 'pdf';

export interface ControlledExtractionSource {
  readonly id: string;
  readonly uri: string;
  readonly title: string;
  readonly sourceType: ControlledSourceType;
  readonly format: ControlledSourceFormat;
  readonly content: string | Uint8Array;
  readonly retrievedAt: string;
  readonly reviewOwner: string;
  readonly modules?: readonly string[];
  readonly licenseStatus?: 'permitted' | 'review-required' | 'restricted' | 'unknown';
  readonly license?: string;
  readonly accessRestrictions?: 'public' | 'operator-approved' | 'restricted' | 'unknown';
}

export interface ControlledExtractionClaim {
  readonly id: string;
  readonly resourceId: string;
  readonly pointer: string;
  readonly proposedValue: unknown;
  readonly locator: {
    readonly page?: number;
    readonly section?: string;
    readonly selector?: string;
    readonly textRange?: string;
    readonly sheet?: string;
    readonly cell?: string;
  };
  readonly observedAt?: string;
  readonly confidence?: number;
  readonly authorityClass?: keyof typeof authorityRank;
  readonly privacyClass?:
    | 'public-reviewed'
    | 'public-review-required'
    | 'personal-data'
    | 'sensitive-data'
    | 'quarantined';
  readonly owner?: string;
  readonly method?: ClaimMethod;
}

export interface ControlledExtractionOptions {
  readonly now?: Date;
  readonly candidateId?: string;
  readonly requiredOwners?: readonly string[];
}

export interface ControlledExtractionResult {
  readonly source: JsonObject;
  readonly claims: readonly JsonObject[];
  readonly conflicts: readonly JsonObject[];
  readonly candidate: JsonObject;
  readonly privacy: PrivacyReviewReport;
  readonly findings: readonly Finding[];
  readonly directPublication: false;
}

const MAX_CONTROLLED_EXTRACTION_BYTES = 4 * 1024 * 1024;
const MAX_CONTROLLED_EXTRACTION_CLAIMS = 10_000;
const MAX_AGENTIC_JSON_DEPTH = 128;
const sensitiveSourcePattern =
  /(?:student|pupil|gradebook|attendance|discipline|iep|504|medical|password|secret|token|credential|private\s*key|api\s*key)\s*[:=]/iu;

/**
 * Convert a controlled, operator-supplied source snapshot into review metadata.
 *
 * The raw source is intentionally never returned. Claims are explicit inputs so
 * extraction remains evidence-led and a parser cannot silently promote inferred
 * content. The resulting candidate is always review-gated and non-publishable.
 */
export function extractControlledCandidate(
  sourceInput: ControlledExtractionSource,
  claimInputs: readonly ControlledExtractionClaim[],
  options: ControlledExtractionOptions = {},
): ControlledExtractionResult {
  assertAbsoluteUri(sourceInput.id, 'source id');
  assertAbsoluteUri(sourceInput.uri, 'source URI');
  if (!sourceInput.title.trim())
    throw new CandidatePolicyError('EOM_EXTRACTION_SOURCE_INVALID', 'Source title is required.');
  if (!sourceInput.reviewOwner.trim())
    throw new CandidatePolicyError(
      'EOM_EXTRACTION_SOURCE_INVALID',
      'Source review owner is required.',
    );
  if (Number.isNaN(Date.parse(sourceInput.retrievedAt))) {
    throw new CandidatePolicyError(
      'EOM_EXTRACTION_SOURCE_INVALID',
      'Source retrievedAt must be an RFC 3339 date-time.',
    );
  }

  const sourceBytes = decodeExtractionBytes(sourceInput.content);
  if (sourceBytes.byteLength > MAX_CONTROLLED_EXTRACTION_BYTES) {
    throw new CandidatePolicyError(
      'EOM_EXTRACTION_SOURCE_TOO_LARGE',
      `Controlled source snapshots are limited to ${MAX_CONTROLLED_EXTRACTION_BYTES} bytes.`,
    );
  }
  if (claimInputs.length > MAX_CONTROLLED_EXTRACTION_CLAIMS) {
    throw new CandidatePolicyError(
      'EOM_EXTRACTION_CLAIMS_TOO_MANY',
      `Controlled extraction is limited to ${MAX_CONTROLLED_EXTRACTION_CLAIMS} claims.`,
    );
  }
  const sourceText =
    sourceInput.format === 'pdf' ? undefined : decodeExtractionText(sourceBytes, sourceInput.uri);
  if (sourceInput.format === 'json') parseStrictJson(sourceText ?? '', sourceInput.uri);

  const digest = digestForBytes(sourceBytes);
  const source = asJsonObject({
    type: 'source-record',
    id: sourceInput.id,
    uri: sourceInput.uri,
    title: sourceInput.title,
    sourceType: sourceInput.sourceType,
    retrievedAt: sourceInput.retrievedAt,
    reviewOwner: sourceInput.reviewOwner,
    status: 'discovered',
    contentDigest: digest,
    snapshot: { kind: 'digest-only', digest },
    licenseStatus: sourceInput.licenseStatus ?? 'unknown',
    accessRestrictions: sourceInput.accessRestrictions ?? 'unknown',
    ...(sourceInput.license ? { license: sourceInput.license } : {}),
    ...(sourceInput.modules
      ? { modules: [...new Set(sourceInput.modules)].sort(compareStrings) }
      : {}),
    notes:
      'Raw source content is retained only by the controlled operator workflow; this record contains metadata and a digest.',
  });

  const rawClaims = claimInputs.map((claim) => extractionClaimRecord(claim, sourceInput, digest));
  const rawConflicts = detectConflicts(rawClaims);
  const privacy = reviewPrivacy({ claims: rawClaims });
  const explicitPrivacyFindings = claimInputs.flatMap((claim, index) => {
    if (!isSensitivePrivacyClass(claim.privacyClass)) return [];
    return [
      finding(
        'EOM_AGENT_PRIVACY_QUARANTINE',
        'privacy',
        'The claim is classified as personal or sensitive data and cannot be returned as a public candidate value.',
        {
          severity: 'error',
          pointer: `/claims/${index}/privacyClass`,
          help: 'Remove the claim or rework it into a genuinely public-reviewed value before release.',
        },
      ),
    ];
  });
  const privacyFindings = uniqueFindings([...privacy.findings, ...explicitPrivacyFindings]);
  const redactedClaimIds = new Set(
    rawClaims.flatMap((claim, index) => {
      const claimPrefix = `/claims/${index}/proposedValue`;
      const contentFlagged = privacy.redactedPaths.some(
        (path) => path === claimPrefix || path.startsWith(`${claimPrefix}/`),
      );
      const locatorFlagged = privacy.redactedPaths.some(
        (path) =>
          path === `/claims/${index}/source/locator` ||
          path.startsWith(`/claims/${index}/source/locator/`),
      );
      return contentFlagged ||
        locatorFlagged ||
        isSensitivePrivacyClass(stringAt(claim, ['privacyClass']))
        ? [stringAt(claim, ['id'])].filter((value): value is string => value !== undefined)
        : [];
    }),
  );
  const claims = rawClaims.map((claim) => {
    if (!redactedClaimIds.has(stringAt(claim, ['id']) ?? '')) return claim;
    const source = isJsonObject(claim.source) ? claim.source : {};
    return asJsonObject({
      ...claim,
      proposedValue: null,
      source: { ...source, locator: { section: '[redacted]' } },
    });
  });
  const conflicts = redactSensitiveConflictValues(rawConflicts, redactedClaimIds);
  const sourcePatternFinding = sensitiveSourcePattern.test(sourceText ?? '')
    ? [
        finding(
          'EOM_AGENT_PRIVACY_QUARANTINE',
          'privacy',
          'The controlled source snapshot contains a sensitive-field pattern and is quarantined from publication.',
          {
            severity: 'error',
            help: 'Remove private data and repeat human review; raw source content is not included in this result.',
          },
        ),
      ]
    : [];
  const findings = uniqueFindings([...privacyFindings, ...sourcePatternFinding]);
  const privacyResult: PrivacyReviewReport = {
    status: findings.length === 0 ? 'clear' : 'quarantined',
    findings,
    redactedPaths: [
      ...new Set([
        ...privacy.redactedPaths,
        ...[...redactedClaimIds].flatMap((claimId) => {
          const index = rawClaims.findIndex((claim) => stringAt(claim, ['id']) === claimId);
          return index >= 0 ? [`/claims/${index}/proposedValue`] : [];
        }),
      ]),
    ].sort(compareStrings),
    reportContainsSensitiveValues: false,
  };
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime()))
    throw new CandidatePolicyError(
      'EOM_EXTRACTION_SOURCE_INVALID',
      'Extraction clock must be valid.',
    );
  const candidateDigest = createHash('sha256')
    .update(
      `${sourceInput.id}\n${digest}\n${claims
        .map((claim) => stringAt(claim, ['id']) ?? '')
        .sort(compareStrings)
        .join('\n')}`,
      'utf8',
    )
    .digest('hex')
    .slice(0, 24);
  const candidateId = options.candidateId ?? `urn:eom:candidate:${candidateDigest}`;
  assertAbsoluteUri(candidateId, 'candidate id');
  const requiredOwners = [
    ...new Set([
      sourceInput.reviewOwner,
      ...(options.requiredOwners ?? []),
      ...claims.map((claim) => stringAt(claim, ['review', 'requiredOwner']) ?? '').filter(Boolean),
    ]),
  ].sort(compareStrings);
  const candidate = asJsonObject({
    type: 'candidate-workspace',
    id: candidateId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    status: 'extracted',
    sourceSet: [sourceInput.id],
    claims: claims.map((claim) => stringAt(claim, ['id']) ?? ''),
    ...(conflicts.length > 0
      ? { conflicts: conflicts.map((conflict) => stringAt(conflict, ['id']) ?? '') }
      : {}),
    requiredOwners,
    directPublication: false,
    privacyReview: privacyResult.status,
    notes:
      'Extraction is a candidate-only result. Human review, conflict resolution, privacy clearance, and release approval are required before publication.',
  });
  return {
    source,
    claims,
    conflicts,
    candidate,
    privacy: privacyResult,
    findings,
    directPublication: false,
  };
}

function extractionClaimRecord(
  claim: ControlledExtractionClaim,
  source: ControlledExtractionSource,
  sourceDigest: string,
): JsonObject {
  assertAbsoluteUri(claim.id, 'claim id');
  assertAbsoluteUri(claim.resourceId, 'claim resource id');
  if (!isJsonPointer(claim.pointer))
    throw new CandidatePolicyError(
      'EOM_EXTRACTION_CLAIM_INVALID',
      `Invalid JSON Pointer for claim ${claim.id}.`,
    );
  const locator = normalizeLocator(claim.locator, claim.id);
  if (claim.observedAt !== undefined && Number.isNaN(Date.parse(claim.observedAt)))
    throw new CandidatePolicyError(
      'EOM_EXTRACTION_CLAIM_INVALID',
      `Claim ${claim.id} observedAt must be an RFC 3339 date-time.`,
    );
  if (
    claim.confidence !== undefined &&
    (!Number.isFinite(claim.confidence) || claim.confidence < 0 || claim.confidence > 1)
  )
    throw new CandidatePolicyError(
      'EOM_EXTRACTION_CLAIM_INVALID',
      `Claim ${claim.id} confidence must be between 0 and 1.`,
    );
  if (!isJsonValue(claim.proposedValue))
    throw new CandidatePolicyError(
      'EOM_EXTRACTION_CLAIM_INVALID',
      `Claim ${claim.id} proposedValue must be JSON-compatible.`,
    );
  const observedAt = claim.observedAt ?? source.retrievedAt;
  return asJsonObject({
    type: 'claim-record',
    id: claim.id,
    target: { resourceId: claim.resourceId, pointer: claim.pointer },
    proposedValue: claim.proposedValue,
    source: { sourceId: source.id, locator },
    evidence: { observedAt, contentDigest: sourceDigest },
    method: { kind: claim.method ?? 'direct-extraction' },
    confidence: claim.confidence ?? 0,
    authorityClass: claim.authorityClass ?? 'unknown',
    privacyClass: claim.privacyClass ?? 'public-review-required',
    review: { state: 'pending', requiredOwner: claim.owner ?? source.reviewOwner },
  });
}

function isSensitivePrivacyClass(value: string | undefined): boolean {
  return value === 'personal-data' || value === 'sensitive-data' || value === 'quarantined';
}

function redactSensitiveConflictValues(
  conflicts: readonly JsonObject[],
  redactedClaimIds: ReadonlySet<string>,
): readonly JsonObject[] {
  return conflicts.map((conflict) => {
    const entries = Array.isArray(conflict.claims)
      ? conflict.claims.map((entry) => {
          if (!isJsonObject(entry) || typeof entry.claimId !== 'string') return entry;
          return redactedClaimIds.has(entry.claimId) ? { ...entry, value: null } : entry;
        })
      : conflict.claims;
    return asJsonObject({ ...conflict, claims: entries });
  });
}

function decodeExtractionBytes(value: string | Uint8Array): Uint8Array {
  if (typeof value === 'string') return new TextEncoder().encode(value);
  return new Uint8Array(value);
}

function decodeExtractionText(value: Uint8Array, source: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(value);
  } catch {
    throw new CandidatePolicyError(
      'EOM_EXTRACTION_SOURCE_INVALID',
      `Controlled text source ${source} must be valid UTF-8.`,
    );
  }
}

function digestForBytes(value: Uint8Array): string {
  return `sha-256=:${createHash('sha256').update(value).digest('base64')}:`;
}

function normalizeLocator(value: unknown, claimId: string): ControlledExtractionClaim['locator'] {
  const allowed = new Set(['page', 'section', 'selector', 'textRange', 'sheet', 'cell']);
  if (!isJsonObject(value)) {
    throw new CandidatePolicyError(
      'EOM_EXTRACTION_CLAIM_INVALID',
      `Claim ${claimId} requires an object evidence locator.`,
    );
  }
  const normalized: Record<string, string | number> = {};
  for (const [key, part] of Object.entries(value)) {
    if (!allowed.has(key)) {
      throw new CandidatePolicyError(
        'EOM_EXTRACTION_CLAIM_INVALID',
        `Claim ${claimId} contains an unsupported locator field ${key}.`,
      );
    }
    if (key === 'page') {
      if (typeof part !== 'number' || !Number.isInteger(part) || part < 1) {
        throw new CandidatePolicyError(
          'EOM_EXTRACTION_CLAIM_INVALID',
          `Claim ${claimId} locator page must be a positive integer.`,
        );
      }
      normalized[key] = part;
    } else {
      if (typeof part !== 'string' || part.trim().length === 0) {
        throw new CandidatePolicyError(
          'EOM_EXTRACTION_CLAIM_INVALID',
          `Claim ${claimId} locator field ${key} must be non-empty text.`,
        );
      }
      normalized[key] = part;
    }
  }
  if (Object.keys(normalized).length === 0) {
    throw new CandidatePolicyError(
      'EOM_EXTRACTION_CLAIM_INVALID',
      `Claim ${claimId} requires an evidence locator.`,
    );
  }
  return normalized;
}

function assertAbsoluteUri(value: string, label: string): void {
  try {
    const parsed = new URL(value);
    if (!parsed.protocol || (!parsed.hostname && parsed.protocol !== 'urn:'))
      throw new Error('missing authority');
  } catch {
    throw new CandidatePolicyError(
      'EOM_EXTRACTION_URI_INVALID',
      `${label} must be an absolute URI.`,
    );
  }
}

const authorityRank: Readonly<Record<string, number>> = {
  'government-identity': 0,
  'organization-origin': 1,
  'governing-body': 2,
  'government-dataset': 3,
  'authorized-vendor': 4,
  'foundation-derived': 5,
  'third-party': 6,
  unknown: 7,
};

const prohibitedKeyPattern =
  /(?:student|pupil|gradebook|attendance|discipline|iep|504|sen|medical|safeguard|accommodation|private.?schedule|private.?transport|password|secret|token|credential|private.?key|api.?key)/iu;

/** Validate an RFC 6901 JSON Pointer without resolving or executing it. */
export function isJsonPointer(value: string): boolean {
  return value === '' || /^(?:\/(?:[^~/]|~[01])*)+$/u.test(value);
}

export function decodeJsonPointer(value: string): readonly string[] | undefined {
  if (!isJsonPointer(value)) return undefined;
  if (value === '') return [];
  return value
    .slice(1)
    .split('/')
    .map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'));
}

export function sourcePathIsCandidate(value: string): boolean {
  return value
    .split(/[\\/]+/u)
    .filter(Boolean)
    .some((part) => part.toLowerCase() === 'candidates');
}

export function assertApprovedSourcePath(value: string): void {
  if (sourcePathIsCandidate(value)) {
    throw new CandidatePolicyError(
      'EOM_CANDIDATE_SOURCE_BLOCKED',
      'Candidate workspace paths cannot be used as publication generator inputs. Promote reviewed files into an approved source tree first.',
    );
  }
}

export class CandidatePolicyError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CandidatePolicyError';
  }
}

export function recommendClaim(claims: readonly unknown[]): Recommendation {
  const usable = claims
    .map((claim, index) => ({ claim, index, id: stringAt(claim, ['id']) }))
    .filter((item): item is { claim: unknown; index: number; id: string } => item.id !== undefined);
  const ranked = [...usable].sort((left, right) => {
    const authority = authorityRankFor(left.claim) - authorityRankFor(right.claim);
    if (authority !== 0) return authority;
    const review = reviewRank(left.claim) - reviewRank(right.claim);
    if (review !== 0) return review;
    const recency =
      dateValue(right.claim, ['evidence', 'observedAt']) -
      dateValue(left.claim, ['evidence', 'observedAt']);
    if (recency !== 0) return recency;
    return left.index - right.index;
  });
  const recommended = ranked[0]?.id;
  return {
    ...(recommended ? { recommendedClaimId: recommended } : {}),
    preservedClaimIds: usable.filter((item) => item.id !== recommended).map((item) => item.id),
    reason: recommended
      ? 'Recommendation uses claim-category authority, review state, and observation recency; all competing claims remain preserved.'
      : 'No claim with a stable identifier was available; no claim was selected or discarded.',
  };
}

export function detectConflicts(claims: readonly unknown[]): readonly JsonObject[] {
  const groups = new Map<string, unknown[]>();
  for (const claim of claims) {
    const key = targetKey(claim);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(claim);
    groups.set(key, group);
  }
  const conflicts: JsonObject[] = [];
  for (const [key, group] of groups) {
    const distinct = new Map<string, unknown>();
    for (const claim of group)
      distinct.set(canonicalUnknown(valueAt(claim, ['proposedValue'])), claim);
    if (distinct.size < 2) continue;
    const recommendation = recommendClaim(group);
    const [resourceId, pointer] = key.split('|', 2);
    if (!resourceId || pointer === undefined) continue;
    const entries: JsonValue[] = group.flatMap((claim) => {
      const claimId = stringAt(claim, ['id']);
      const provenance = stringAt(claim, ['provenance']) ?? stringAt(claim, ['source', 'sourceId']);
      if (!claimId || !provenance) return [];
      return [
        asJsonObject({
          claimId,
          value: asJsonValue(valueAt(claim, ['proposedValue'])),
          provenance,
          ...(dateStringAt(claim, ['evidence', 'observedAt'])
            ? { observedAt: dateStringAt(claim, ['evidence', 'observedAt']) }
            : {}),
        }),
      ];
    });
    const digest = createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 24);
    conflicts.push(
      asJsonObject({
        type: 'conflict-record',
        id: `https://paperandslate.org/eom/conflicts/${digest}`,
        target: { resourceId, pointer },
        claims: entries,
        status: 'unresolved',
        reason: 'Distinct claims target the same resource field and require human resolution.',
        conflictType: 'direct-disagreement',
        ...(recommendation.recommendedClaimId
          ? { recommendedClaimId: recommendation.recommendedClaimId }
          : {}),
        precedenceExplanation: recommendation.reason,
        materiality: 'medium',
      }),
    );
  }
  return conflicts;
}

export function auditStaleness(
  sources: readonly unknown[],
  claims: readonly unknown[],
  options: StalenessOptions = {},
): readonly Finding[] {
  const now = options.now ?? new Date();
  const maxAgeDays = positiveInteger(options.maxAgeDays, 365);
  const cutoff = now.getTime() - maxAgeDays * 86_400_000;
  const findings: Finding[] = [];
  sources.forEach((source, index) => {
    const date = dateValue(source, ['retrievedAt']) || dateValue(source, ['observedAt']);
    if (date > 0 && date < cutoff) {
      findings.push(
        finding(
          'EOM_PROVENANCE_STALE_SOURCE',
          'freshness',
          'A source record is older than the configured review window.',
          {
            severity: 'warning',
            pointer: `/sources/${index}/retrievedAt`,
            help: 'Recheck the source or explicitly mark the claim stale; do not delete values automatically.',
          },
        ),
      );
    }
    const until = dateValue(source, ['effective', 'until']);
    if (until > 0 && until < now.getTime()) {
      findings.push(
        finding(
          'EOM_PROVENANCE_EFFECTIVE_EXPIRED',
          'freshness',
          'A source record is outside its declared effective period.',
          {
            severity: 'warning',
            pointer: `/sources/${index}/effective/until`,
            help: 'Review the source version and preserve historical claims where appropriate.',
          },
        ),
      );
    }
  });
  claims.forEach((claim, index) => {
    const date = dateValue(claim, ['evidence', 'observedAt']);
    if (date > 0 && date < cutoff) {
      findings.push(
        finding(
          'EOM_PROVENANCE_STALE_CLAIM',
          'freshness',
          'A claim evidence observation is older than the configured review window.',
          {
            severity: 'warning',
            pointer: `/claims/${index}/evidence/observedAt`,
            help: 'Request a source refresh before release; staleness is not proof that the value is false.',
          },
        ),
      );
    }
  });
  return findings;
}

export function reviewPrivacy(value: unknown): PrivacyReviewReport {
  const findings: Finding[] = [];
  const redactedPaths: string[] = [];
  walkPrivacy(value, '', findings, redactedPaths, new WeakSet<object>());
  const lintFindings = lintPublication(value);
  for (const item of lintFindings) {
    if (item.category === 'privacy' || item.category === 'security') {
      findings.push({ ...item, message: 'A privacy or security policy check requires review.' });
    }
  }
  const unique = uniqueFindings(findings);
  return {
    status: unique.length === 0 ? 'clear' : 'quarantined',
    findings: unique,
    redactedPaths: [...new Set(redactedPaths)].sort(compareStrings),
    reportContainsSensitiveValues: false,
  };
}

export function provenanceCoverage(document: unknown, claims: readonly unknown[]): CoverageReport {
  const resourceId = stringAt(document, ['id']);
  const claimPointers = claims
    .filter((claim) => !resourceId || stringAt(claim, ['target', 'resourceId']) === resourceId)
    .map((claim) => stringAt(claim, ['target', 'pointer']))
    .filter((pointer): pointer is string => pointer !== undefined && isJsonPointer(pointer));
  const leafPointers = collectLeafPointers(document);
  const coveredPointers = leafPointers.filter((pointer) =>
    claimPointers.some(
      (claimPointer) => pointer === claimPointer || pointer.startsWith(`${claimPointer}/`),
    ),
  );
  const uncoveredPointers = leafPointers.filter((pointer) => !coveredPointers.includes(pointer));
  const findings = uncoveredPointers.map((pointer) =>
    finding(
      'EOM_PROVENANCE_COVERAGE_GAP',
      'quality',
      'A candidate value has no evidence claim targeting this path.',
      {
        severity: 'error',
        pointer,
        help: 'Add an evidence-led claim or remove the candidate value before review.',
      },
    ),
  );
  return {
    ...(resourceId ? { resourceId } : {}),
    claimCount: claims.length,
    coveredPointers,
    uncoveredPointers,
    valid: findings.length === 0,
    findings,
  };
}

export function candidateGate(
  workspace: unknown,
  claims: readonly unknown[],
  conflicts: readonly unknown[] = [],
  privacy: PrivacyReviewReport = {
    status: 'clear',
    findings: [],
    redactedPaths: [],
    reportContainsSensitiveValues: false,
  },
  options: CandidateGateOptions = {},
): CandidateGate {
  const reasons: string[] = [];
  const status = stringAt(workspace, ['status']);
  const workspaceRecord = isJsonObject(workspace) ? workspace : undefined;
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) reasons.push('Candidate gate requires a valid evaluation time.');
  if (status !== 'release-approved') {
    reasons.push(
      'Candidate must be release-approved by an authorized human owner before publication.',
    );
  }
  if (workspaceValue(workspace, ['directPublication']) !== false) {
    reasons.push('Candidate workspace directPublication must remain false.');
  }
  const workspaceOwners = new Set(stringArrayAt(workspaceRecord, ['requiredOwners']));
  if (workspaceOwners.size === 0) {
    reasons.push('Candidate workspace must declare at least one required human review owner.');
  }
  const workspaceSourceIds = new Set(stringArrayAt(workspaceRecord, ['sourceSet']));
  const workspaceClaimIds = new Set(stringArrayAt(workspaceRecord, ['claims']));
  if (workspaceSourceIds.size === 0) reasons.push('Candidate workspace must declare sourceSet.');
  if (workspaceClaimIds.size === 0) reasons.push('Candidate workspace must declare claims.');
  const approval = valueAt(workspaceRecord, ['releaseApproval']);
  if (
    !isJsonObject(approval) ||
    approval.decision !== 'release-approved' ||
    typeof approval.reviewer !== 'string' ||
    approval.reviewer.trim().length === 0 ||
    !workspaceOwners.has(approval.reviewer) ||
    !isValidDateString(approval.approvedAt) ||
    !isValidDateString(approval.expires) ||
    typeof approval.rationale !== 'string' ||
    approval.rationale.trim().length === 0 ||
    Date.parse(approval.approvedAt) > now.getTime() ||
    Date.parse(approval.expires) <= Date.parse(approval.approvedAt) ||
    Date.parse(approval.expires) <= now.getTime()
  ) {
    reasons.push(
      'Release-approved candidates require a current, explicit human releaseApproval record.',
    );
  }
  const notApproved = claims.filter((claim) => {
    const review = valueAt(claim, ['review']);
    return (
      !isJsonObject(claim) ||
      claim.type !== 'claim-record' ||
      !isAbsoluteUriValue(claim.id) ||
      !workspaceClaimIds.has(typeof claim.id === 'string' ? claim.id : '') ||
      !isClaimTargetComplete(claim) ||
      !isClaimSourceComplete(claim, workspaceSourceIds) ||
      !isClaimEvidenceComplete(claim) ||
      !isJsonValue(valueAt(claim, ['proposedValue'])) ||
      !Number.isFinite(numberAt(claim, ['confidence'])) ||
      (numberAt(claim, ['confidence']) ?? -1) < 0 ||
      (numberAt(claim, ['confidence']) ?? 2) > 1 ||
      stringAt(claim, ['privacyClass']) !== 'public-reviewed' ||
      stringAt(claim, ['method', 'kind']) === 'inference' ||
      !isJsonObject(review) ||
      review.state !== 'approved' ||
      typeof review.requiredOwner !== 'string' ||
      review.requiredOwner.trim().length === 0 ||
      !workspaceOwners.has(review.requiredOwner) ||
      typeof review.reviewedBy !== 'string' ||
      review.reviewedBy.trim().length === 0 ||
      !isValidDateString(review.reviewedAt)
    );
  });
  const claimIds = claims
    .map((claim) => stringAt(claim, ['id']))
    .filter((id): id is string => id !== undefined);
  if (
    claimIds.length !== claims.length ||
    new Set(claimIds).size !== claimIds.length ||
    workspaceClaimIds.size !== claimIds.length ||
    claimIds.some((id) => !workspaceClaimIds.has(id))
  ) {
    reasons.push('Candidate workspace claims must exactly match the reviewed claim records.');
  }
  if (notApproved.length > 0) {
    reasons.push(
      `${notApproved.length} claim(s) are missing complete, owner-bound publication evidence or approval metadata.`,
    );
  }
  const unsafeClaims = claims.filter((claim) => {
    const privacyClass = stringAt(claim, ['privacyClass']);
    const method = stringAt(claim, ['method', 'kind']);
    return privacyClass !== 'public-reviewed' || method === 'inference';
  });
  if (unsafeClaims.length > 0) {
    reasons.push(
      `${unsafeClaims.length} claim(s) are not publication-safe public-reviewed claims.`,
    );
  }
  const unresolved = conflicts.filter(
    (conflict) => stringAt(conflict, ['status']) === 'unresolved',
  );
  if (unresolved.length > 0) {
    reasons.push(`${unresolved.length} conflict(s) remain unresolved.`);
  }
  const workspacePrivacy = stringAt(workspace, ['privacyReview']);
  const privacyStatus =
    privacy.status !== 'clear'
      ? privacy.status
      : workspacePrivacy === 'pending' ||
          workspacePrivacy === 'blocked' ||
          workspacePrivacy === 'quarantined'
        ? workspacePrivacy
        : 'clear';
  if (privacyStatus !== 'clear')
    reasons.push('Privacy review is not clear; candidate material is quarantined.');
  return {
    allowed: reasons.length === 0,
    reasons,
    claimCount: claims.length,
    unresolvedConflictCount: unresolved.length,
    privacyStatus,
  };
}

function stringArrayAt(value: unknown, path: readonly string[]): string[] {
  const candidate = valueAt(value, path);
  return Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function isAbsoluteUriValue(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    assertAbsoluteUri(value, 'URI');
    return true;
  } catch {
    return false;
  }
}

function isValidDateString(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isClaimTargetComplete(value: JsonObject): boolean {
  const pointer = valueAt(value, ['target', 'pointer']);
  return (
    isAbsoluteUriValue(valueAt(value, ['target', 'resourceId'])) &&
    typeof pointer === 'string' &&
    isJsonPointer(pointer)
  );
}

function isClaimSourceComplete(value: JsonObject, sourceIds: ReadonlySet<string>): boolean {
  const sourceId = stringAt(value, ['source', 'sourceId']);
  return (
    sourceId !== undefined &&
    sourceIds.has(sourceId) &&
    hasLocator(valueAt(value, ['source', 'locator']))
  );
}

function isClaimEvidenceComplete(value: JsonObject): boolean {
  return (
    isValidDateString(valueAt(value, ['evidence', 'observedAt'])) &&
    typeof valueAt(value, ['evidence', 'contentDigest']) === 'string' &&
    stringAt(value, ['evidence', 'contentDigest'])!.length > 0
  );
}

function hasLocator(value: unknown): boolean {
  if (!isJsonObject(value)) return false;
  const allowed = new Set(['page', 'section', 'selector', 'textRange', 'sheet', 'cell']);
  const entries = Object.entries(value);
  return (
    entries.length > 0 &&
    entries.every(
      ([key, part]) =>
        allowed.has(key) &&
        (key === 'page'
          ? typeof part === 'number' && Number.isInteger(part) && part >= 1
          : typeof part === 'string' && part.trim().length > 0),
    )
  );
}

export function assertPublicationAllowed(
  workspace: unknown,
  claims: readonly unknown[],
  conflicts: readonly unknown[] = [],
  privacy?: PrivacyReviewReport,
): void {
  const gate = candidateGate(workspace, claims, conflicts, privacy);
  if (!gate.allowed) {
    throw new CandidatePolicyError('EOM_CANDIDATE_REVIEW_REQUIRED', gate.reasons.join(' '));
  }
}

export function buildReviewReport(
  workspace: unknown,
  sources: readonly unknown[],
  claims: readonly unknown[],
  conflicts: readonly unknown[] = [],
  candidateValue?: unknown,
): ReviewReport {
  const privacy =
    candidateValue === undefined ? clearPrivacyReport() : reviewPrivacy(candidateValue);
  const gate = candidateGate(workspace, claims, conflicts, privacy);
  const confidenceValues = claims
    .map((claim) => numberAt(claim, ['confidence']))
    .filter((value): value is number => value !== undefined);
  const methodCounts = countValues(claims, ['method', 'kind']);
  const authorityCounts = countValues(claims, ['authorityClass']);
  const changedResources = [
    ...new Set(
      claims
        .map((claim) => stringAt(claim, ['target', 'resourceId']))
        .filter((id): id is string => id !== undefined),
    ),
  ].sort();
  const candidateId = stringAt(workspace, ['id']);
  const status = candidateStatus(workspace);
  const report: Omit<ReviewReport, 'candidateId' | 'status'> = {
    publication: gate.allowed ? 'release-approved' : 'blocked',
    sourceCount: sources.length,
    claimCount: claims.length,
    methodCounts,
    authorityCounts,
    confidence: {
      ...(confidenceValues.length > 0 ? { minimum: Math.min(...confidenceValues) } : {}),
      ...(confidenceValues.length > 0 ? { maximum: Math.max(...confidenceValues) } : {}),
      ...(confidenceValues.length > 0
        ? {
            average:
              confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length,
          }
        : {}),
    },
    unresolvedConflictIds: conflicts
      .filter((conflict) => stringAt(conflict, ['status']) === 'unresolved')
      .map((conflict) => stringAt(conflict, ['id']))
      .filter((id): id is string => id !== undefined)
      .sort(),
    privacy,
    requiredReviewStates: [
      ...new Set(claims.map((claim) => stringAt(claim, ['review', 'state'])).filter(isReviewState)),
    ],
    changedResources,
    noSensitiveValues: true,
  };
  if (candidateId && status) return { ...report, candidateId, status };
  if (candidateId) return { ...report, candidateId };
  if (status) return { ...report, status };
  return report;
}

function walkPrivacy(
  value: unknown,
  pointer: string,
  findings: Finding[],
  redactedPaths: string[],
  visited: WeakSet<object>,
  depth = 0,
): void {
  if (depth > MAX_AGENTIC_JSON_DEPTH) {
    findings.push(
      finding(
        'EOM_AGENT_PRIVACY_DEPTH',
        'security',
        'Candidate evidence exceeds the maximum inspection depth.',
        {
          severity: 'error',
          ...(pointer ? { pointer } : {}),
          help: 'Reduce nested input before review; deeply nested evidence is quarantined.',
        },
      ),
    );
    return;
  }
  if (typeof value === 'string') {
    if (/(?:student|pupil)\s*(?:name|id)|student@|@student\b/iu.test(value)) {
      findings.push(
        finding(
          'EOM_AGENT_PRIVACY_QUARANTINE',
          'privacy',
          'Candidate evidence contains a prohibited personal-data pattern.',
          {
            severity: 'error',
            ...(pointer ? { pointer } : {}),
            help: 'Quarantine the source and remove private data; do not include the value in a report.',
          },
        ),
      );
      if (pointer) redactedPaths.push(pointer);
    }
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  if (visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      walkPrivacy(item, `${pointer}/${index}`, findings, redactedPaths, visited, depth + 1),
    );
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPointer = `${pointer}/${escapePointer(key)}`;
    if (prohibitedKeyPattern.test(key)) {
      findings.push(
        finding(
          'EOM_AGENT_PRIVACY_QUARANTINE',
          'privacy',
          'Candidate evidence uses a prohibited or sensitive field.',
          {
            severity: 'error',
            pointer: childPointer,
            help: 'Quarantine the source and redact the field before any review report is shared.',
          },
        ),
      );
      redactedPaths.push(childPointer);
      continue;
    }
    walkPrivacy(child, childPointer, findings, redactedPaths, visited, depth + 1);
  }
}

function collectLeafPointers(
  value: unknown,
  pointer = '',
  result: string[] = [],
  depth = 0,
  visited = new WeakSet<object>(),
): readonly string[] {
  if (depth > MAX_AGENTIC_JSON_DEPTH) {
    result.push(pointer || '/');
    return result;
  }
  if (pointer === '' && isJsonObject(value)) {
    if (visited.has(value)) {
      result.push(pointer || '/');
      return result;
    }
    visited.add(value);
    try {
      for (const key of Object.keys(value)) {
        if (['$schema', 'specification', 'version', 'type'].includes(key)) continue;
        collectLeafPointers(value[key], `/${escapePointer(key)}`, result, depth + 1, visited);
      }
    } finally {
      visited.delete(value);
    }
    return result;
  }
  if (typeof value !== 'object' || value === null) {
    if (pointer) result.push(pointer);
    return result;
  }
  if (visited.has(value)) {
    if (pointer) result.push(pointer);
    return result;
  }
  visited.add(value);
  if (Array.isArray(value)) {
    try {
      value.forEach((item, index) =>
        collectLeafPointers(item, `${pointer}/${index}`, result, depth + 1, visited),
      );
    } finally {
      visited.delete(value);
    }
    return result;
  }
  try {
    const entries = Object.entries(value);
    if (entries.length === 0 && pointer) result.push(pointer);
    for (const [key, child] of entries) {
      collectLeafPointers(child, `${pointer}/${escapePointer(key)}`, result, depth + 1, visited);
    }
  } finally {
    visited.delete(value);
  }
  return result;
}

function targetKey(value: unknown): string | undefined {
  const resourceId = stringAt(value, ['target', 'resourceId']);
  const pointer = stringAt(value, ['target', 'pointer']);
  return resourceId && pointer !== undefined && isJsonPointer(pointer)
    ? `${resourceId}|${pointer}`
    : undefined;
}

function authorityRankFor(value: unknown): number {
  const authority = stringAt(value, ['authorityClass']);
  return authority === undefined ? 99 : (authorityRank[authority] ?? 99);
}

function reviewRank(value: unknown): number {
  const state = stringAt(value, ['review', 'state']);
  return state === 'approved' ? 0 : state === 'pending' ? 1 : 2;
}

function candidateStatus(value: unknown): CandidateStatus | undefined {
  const status = stringAt(value, ['status']);
  return isCandidateStatus(status) ? status : undefined;
}

function isCandidateStatus(value: string | undefined): value is CandidateStatus {
  return (
    value !== undefined &&
    [
      'discovered',
      'extracted',
      'normalized',
      'validation-failed',
      'review-ready',
      'changes-requested',
      'approved',
      'generated',
      'release-approved',
      'published',
      'superseded',
    ].includes(value)
  );
}

function isReviewState(value: string | undefined): value is ReviewState {
  return (
    value !== undefined &&
    ['pending', 'changes-requested', 'approved', 'rejected', 'quarantined'].includes(value)
  );
}

function clearPrivacyReport(): PrivacyReviewReport {
  return { status: 'clear', findings: [], redactedPaths: [], reportContainsSensitiveValues: false };
}

function countValues(
  values: readonly unknown[],
  path: readonly string[],
): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = stringAt(value, path);
    if (key) counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => compareStrings(left, right)),
  );
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueFindings(values: readonly Finding[]): readonly Finding[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.code}|${value.pointer ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stringAt(value: unknown, path: readonly string[]): string | undefined {
  const result = valueAt(value, path);
  return typeof result === 'string' ? result : undefined;
}

function dateStringAt(value: unknown, path: readonly string[]): string | undefined {
  return stringAt(value, path);
}

function numberAt(value: unknown, path: readonly string[]): number | undefined {
  const result = valueAt(value, path);
  return typeof result === 'number' && Number.isFinite(result) ? result : undefined;
}

function dateValue(value: unknown, path: readonly string[]): number {
  const date = stringAt(value, path);
  if (!date) return 0;
  const parsed = Date.parse(date);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function valueAt(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (!isJsonObject(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function workspaceValue(value: unknown, path: readonly string[]): unknown {
  return valueAt(value, path);
}

function canonicalUnknown(value: unknown): string {
  if (isJsonValue(value)) return stringifyCanonical(stableJsonValue(value));
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return `${value}`;
  }
  try {
    return JSON.stringify(value) ?? Object.prototype.toString.call(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function asJsonValue(value: unknown): JsonValue {
  if (isJsonValue(value)) return value;
  return null;
}

function asJsonObject(value: Record<string, unknown>): JsonObject {
  const result: JsonObject = {};
  for (const [key, child] of Object.entries(value)) result[key] = asJsonValue(child);
  return result;
}

function isJsonValue(
  value: unknown,
  depth = 0,
  visited = new WeakSet<object>(),
): value is JsonValue {
  if (depth > MAX_AGENTIC_JSON_DEPTH) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (visited.has(value)) return false;
  visited.add(value);
  try {
    if (Array.isArray(value)) return value.every((item) => isJsonValue(item, depth + 1, visited));
    if (isJsonObject(value))
      return Object.values(value).every((item) => isJsonValue(item, depth + 1, visited));
  } finally {
    visited.delete(value);
  }
  return false;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}
