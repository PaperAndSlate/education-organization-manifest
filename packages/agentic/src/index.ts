import { createHash } from 'node:crypto';
import {
  isJsonObject,
  stableJsonValue,
  stringifyCanonical,
  type JsonObject,
  type JsonValue,
} from '@paperandslate/eom-core';
import { lintPublication } from '@paperandslate/eom-linter';
import { finding, type Finding } from '@paperandslate/eom-validator';

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
    redactedPaths: [...new Set(redactedPaths)].sort(),
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
): CandidateGate {
  const reasons: string[] = [];
  const status = stringAt(workspace, ['status']);
  if (status !== 'release-approved') {
    reasons.push(
      'Candidate must be release-approved by an authorized human owner before publication.',
    );
  }
  if (workspaceValue(workspace, ['directPublication']) !== false) {
    reasons.push('Candidate workspace directPublication must remain false.');
  }
  const notApproved = claims.filter((claim) => stringAt(claim, ['review', 'state']) !== 'approved');
  if (notApproved.length > 0) {
    reasons.push(`${notApproved.length} claim(s) are not approved by their required owner.`);
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
): void {
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
      walkPrivacy(item, `${pointer}/${index}`, findings, redactedPaths, visited),
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
    walkPrivacy(child, childPointer, findings, redactedPaths, visited);
  }
}

function collectLeafPointers(
  value: unknown,
  pointer = '',
  result: string[] = [],
): readonly string[] {
  if (pointer === '' && isJsonObject(value)) {
    for (const key of Object.keys(value)) {
      if (['$schema', 'specification', 'version', 'type'].includes(key)) continue;
      collectLeafPointers(value[key], `/${escapePointer(key)}`, result);
    }
    return result;
  }
  if (typeof value !== 'object' || value === null) {
    if (pointer) result.push(pointer);
    return result;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectLeafPointers(item, `${pointer}/${index}`, result));
    return result;
  }
  const entries = Object.entries(value);
  if (entries.length === 0 && pointer) result.push(pointer);
  for (const [key, child] of entries) {
    collectLeafPointers(child, `${pointer}/${escapePointer(key)}`, result);
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
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
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
  return isJsonValue(value) ? stringifyCanonical(stableJsonValue(value)) : String(value);
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

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isJsonObject(value)) return Object.values(value).every(isJsonValue);
  return false;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}
