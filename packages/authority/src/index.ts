import { isSameOrigin, isPathWithin, normalizeOrigin, originOf } from '@paperandslate/eom-core';
import { finding, type Finding } from '@paperandslate/eom-validator';

export type AuthorityTrustLabel =
  | 'root-linked'
  | 'delegated'
  | 'signed'
  | 'signed-and-delegated'
  | 'mirrored'
  | 'unverified-external';

export interface AuthorityOptions {
  readonly now?: Date;
}

export interface AuthorityResult {
  readonly accepted: boolean;
  readonly rootAuthority: boolean;
  readonly delegationPresent: boolean;
  readonly resourceTypeInScope: boolean;
  readonly resourceIdInScope: boolean;
  readonly originInScope: boolean;
  readonly pathInScope: boolean;
  readonly temporalValid: boolean;
  readonly active: boolean;
  readonly transitiveAllowed: false;
  readonly trustLabel: AuthorityTrustLabel;
  readonly finalUrl: string;
  readonly findings: readonly Finding[];
}

/** Evaluate root-origin and explicitly scoped cross-origin authority without fetching. */
export function evaluateAuthority(
  manifest: unknown,
  resource: unknown,
  finalUrl: string,
  options: AuthorityOptions = {},
): AuthorityResult {
  const now = options.now ?? new Date();
  const rootOrigin = originAt(manifest, ['scope', 'origin']) ?? originAt(manifest, ['canonical']);
  const resourceType = stringAt(resource, ['type']);
  const resourceId = stringAt(resource, ['id']);
  const finalOrigin = originOf(finalUrl);
  const rootAuthority =
    rootOrigin !== undefined && finalOrigin !== undefined && isSameOrigin(finalUrl, rootOrigin);
  const findings: Finding[] = [];
  const paths = arrayAt(manifest, ['scope', 'paths']).filter(isString);
  const rootPathInScope =
    rootOrigin === undefined || paths.length === 0 || isPathWithin(finalUrl, rootOrigin, paths);
  if (rootAuthority && !rootPathInScope) {
    findings.push(
      finding(
        'EOM_AUTHORITY_ROOT_PATH_OUT_OF_SCOPE',
        'security',
        'The root-origin resource URL is outside the manifest path scope.',
        { severity: 'error', related: [rootOrigin ?? finalUrl] },
      ),
    );
  }
  const delegations = arrayAt(manifest, ['delegations']);
  const delegationPresent = delegations.some((item) => isRecord(item));
  if (rootAuthority && rootPathInScope) {
    return {
      accepted: true,
      rootAuthority: true,
      delegationPresent,
      resourceTypeInScope: true,
      resourceIdInScope: true,
      originInScope: true,
      pathInScope: true,
      temporalValid: true,
      active: true,
      transitiveAllowed: false,
      trustLabel: 'root-linked',
      finalUrl,
      findings,
    };
  }

  let best: DelegationMatch | undefined;
  for (const delegation of delegations) {
    const match = evaluateDelegation(delegation, resource, finalUrl, now);
    findings.push(...match.findings);
    if (match.accepted && best === undefined) best = match;
  }
  if (best) {
    return {
      accepted: true,
      rootAuthority: false,
      delegationPresent,
      resourceTypeInScope: best.resourceTypeInScope,
      resourceIdInScope: best.resourceIdInScope,
      originInScope: best.originInScope,
      pathInScope: best.pathInScope,
      temporalValid: best.temporalValid,
      active: best.active,
      transitiveAllowed: false,
      trustLabel: 'delegated',
      finalUrl,
      findings,
    };
  }
  if (!rootAuthority) {
    findings.push(
      finding(
        'EOM_AUTHORITY_UNVERIFIED_EXTERNAL',
        'security',
        'The resource is not on the root origin and no active delegation covers its scope.',
        {
          severity: 'error',
          related: [finalUrl],
          help: 'Add a time-bounded non-transitive delegation or keep the resource on the root origin.',
        },
      ),
    );
  }
  return {
    accepted: false,
    rootAuthority: false,
    delegationPresent,
    resourceTypeInScope: false,
    resourceIdInScope: false,
    originInScope: false,
    pathInScope: false,
    temporalValid: false,
    active: false,
    transitiveAllowed: false,
    trustLabel: 'unverified-external',
    finalUrl,
    findings: uniqueFindings(findings),
  };
}

interface DelegationMatch {
  readonly accepted: boolean;
  readonly resourceTypeInScope: boolean;
  readonly resourceIdInScope: boolean;
  readonly originInScope: boolean;
  readonly pathInScope: boolean;
  readonly temporalValid: boolean;
  readonly active: boolean;
  readonly findings: readonly Finding[];
}

function evaluateDelegation(
  delegation: unknown,
  resource: unknown,
  finalUrl: string,
  now: Date,
): DelegationMatch {
  const findings: Finding[] = [];
  const finalOrigin = originOf(finalUrl);
  const basePointer = `/delegations/${stringAt(delegation, ['id']) ?? 'unknown'}`;
  const active = stringAt(delegation, ['status']) === 'active';
  const transitive = valueAt(delegation, ['transitive']);
  if (transitive !== false) {
    findings.push(
      finding(
        'EOM_DELEGATION_TRANSITIVE_FORBIDDEN',
        'security',
        'Stable v1 delegation evaluation rejects transitive delegation.',
        { severity: 'error', pointer: `${basePointer}/transitive` },
      ),
    );
  }
  if (!active) {
    findings.push(
      finding(
        stringAt(delegation, ['status']) === 'revoked'
          ? 'EOM_DELEGATION_REVOKED'
          : 'EOM_DELEGATION_NOT_ACTIVE',
        'security',
        'A delegation must be active at evaluation time.',
        { severity: 'error', pointer: `${basePointer}/status` },
      ),
    );
  }
  const validFrom = dateAt(delegation, ['validFrom']);
  const validUntil = dateAt(delegation, ['validUntil']);
  const revokedAt = dateAt(delegation, ['revokedAt']);
  const temporalValid =
    (validFrom === undefined || validFrom <= now.getTime()) &&
    (validUntil === undefined || validUntil >= now.getTime()) &&
    (revokedAt === undefined || revokedAt > now.getTime());
  if (!temporalValid) {
    findings.push(
      finding(
        revokedAt !== undefined && revokedAt <= now.getTime()
          ? 'EOM_DELEGATION_REVOKED'
          : 'EOM_DELEGATION_EXPIRED',
        'security',
        'The delegation is not temporally valid at evaluation time.',
        { severity: 'error', pointer: `${basePointer}/validUntil` },
      ),
    );
  }
  const resourceType = stringAt(resource, ['type']);
  const resourceId = stringAt(resource, ['id']);
  const typeScope = arrayAt(delegation, ['scope', 'resourceTypes']).filter(isString);
  const idScope = arrayAt(delegation, ['scope', 'resourceIds']).filter(isString);
  const resourceTypeInScope =
    typeScope.length === 0 || (resourceType !== undefined && typeScope.includes(resourceType));
  const resourceIdInScope =
    idScope.length === 0 || (resourceId !== undefined && idScope.includes(resourceId));
  if (!resourceTypeInScope) {
    findings.push(
      finding(
        'EOM_DELEGATION_TYPE_OUT_OF_SCOPE',
        'security',
        'The resource type is outside the delegation scope.',
        {
          severity: 'error',
          pointer: `${basePointer}/scope/resourceTypes`,
        },
      ),
    );
  }
  if (!resourceIdInScope) {
    findings.push(
      finding(
        'EOM_DELEGATION_RESOURCE_OUT_OF_SCOPE',
        'security',
        'The resource id is outside the delegation scope.',
        {
          severity: 'error',
          pointer: `${basePointer}/scope/resourceIds`,
        },
      ),
    );
  }
  const delegate = valueAt(delegation, ['delegate']);
  const delegateOrigin =
    typeof delegate === 'string'
      ? originOf(delegate)
      : (originAt(delegate, ['website']) ?? originAt(delegate, ['id']));
  const allowedOrigins = arrayAt(delegation, ['scope', 'allowedOrigins']).filter(isString);
  const originInScope =
    finalOrigin !== undefined &&
    (allowedOrigins.length > 0
      ? allowedOrigins.some((origin) => normalizeOrigin(origin) === normalizeOrigin(finalOrigin))
      : delegateOrigin !== undefined &&
        normalizeOrigin(finalOrigin) === normalizeOrigin(delegateOrigin));
  if (!originInScope) {
    findings.push(
      finding(
        'EOM_DELEGATION_ORIGIN_OUT_OF_SCOPE',
        'security',
        'The final URL origin is outside the delegation scope.',
        {
          severity: 'error',
          pointer: `${basePointer}/scope/allowedOrigins`,
        },
      ),
    );
  }
  const prefixes = arrayAt(delegation, ['scope', 'allowedPathPrefixes']).filter(isString);
  const pathInScope =
    prefixes.length === 0 ||
    (finalOrigin !== undefined && isPathWithin(finalUrl, finalOrigin, prefixes));
  if (!pathInScope) {
    findings.push(
      finding(
        'EOM_DELEGATION_PATH_OUT_OF_SCOPE',
        'security',
        'The final URL path is outside the delegation scope.',
        {
          severity: 'error',
          pointer: `${basePointer}/scope/allowedPathPrefixes`,
        },
      ),
    );
  }
  const subject = stringAt(delegation, ['subject']);
  const subjects = arrayAt(resource, ['subjects']).filter(isString);
  const subjectValid = subject === undefined || subjects.includes(subject);
  if (!subjectValid) {
    findings.push(
      finding(
        'EOM_DELEGATION_SUBJECT_MISMATCH',
        'security',
        'The delegated resource subject does not match the delegation subject.',
        {
          severity: 'error',
          pointer: `${basePointer}/subject`,
        },
      ),
    );
  }
  const accepted =
    active &&
    transitive === false &&
    temporalValid &&
    resourceTypeInScope &&
    resourceIdInScope &&
    originInScope &&
    pathInScope &&
    subjectValid;
  return {
    accepted,
    resourceTypeInScope,
    resourceIdInScope,
    originInScope,
    pathInScope,
    temporalValid,
    active,
    findings,
  };
}

function originAt(value: unknown, path: readonly string[]): string | undefined {
  const candidate = stringAt(value, path);
  return candidate ? originOf(candidate) : undefined;
}

function dateAt(value: unknown, path: readonly string[]): number | undefined {
  const candidate = stringAt(value, path);
  if (!candidate) return undefined;
  const parsed = Date.parse(candidate);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function valueAt(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function stringAt(value: unknown, path: readonly string[]): string | undefined {
  const candidate = valueAt(value, path);
  return typeof candidate === 'string' ? candidate : undefined;
}

function arrayAt(value: unknown, path: readonly string[]): readonly unknown[] {
  const candidate = valueAt(value, path);
  return Array.isArray(candidate) ? candidate : [];
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
