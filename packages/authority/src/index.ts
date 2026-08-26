import { finding, type Finding } from '@paperandslate/eom-core/findings';
import {
  isAbsoluteUri,
  isHttpsUri,
  isSameOrigin,
  isPathWithin,
  normalizeOrigin,
  originOf,
} from '@paperandslate/eom-core/ids';

export type AuthorityTrustLabel =
  | 'root-linked'
  | 'delegated'
  | 'signed'
  | 'signed-and-delegated'
  | 'mirrored'
  | 'unverified-external';

export interface AuthorityOptions {
  readonly now?: Date;
  /** The already cryptographically verified signing key, when evaluating a signed resource. */
  readonly verifiedKeyId?: string;
}

export interface AuthorityResult {
  readonly accepted: boolean;
  readonly rootAuthority: boolean;
  readonly delegationPresent: boolean;
  readonly resourceTypeInScope: boolean;
  readonly resourceIdInScope: boolean;
  readonly originInScope: boolean;
  readonly pathInScope: boolean;
  readonly subjectValid: boolean;
  readonly keyScopeValid: boolean | 'not-evaluated';
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
  const finalOrigin = originOf(finalUrl);
  const rootAuthority =
    rootOrigin !== undefined && finalOrigin !== undefined && isSameOrigin(finalUrl, rootOrigin);
  const findings: Finding[] = [];
  const paths = arrayAt(manifest, ['scope', 'paths']).filter(isString);
  const excludedPaths = arrayAt(manifest, ['scope', 'excludedPaths']).filter(isString);
  const rawPaths = valueAt(manifest, ['scope', 'paths']);
  const rawExcludedPaths = valueAt(manifest, ['scope', 'excludedPaths']);
  const rootScopeValid =
    (rawPaths === undefined ||
      (Array.isArray(rawPaths) &&
        rawPaths.every((path) => isString(path) && path.startsWith('/')) &&
        new Set(paths).size === paths.length)) &&
    (rawExcludedPaths === undefined ||
      (Array.isArray(rawExcludedPaths) &&
        excludedPaths.every((path) => path.startsWith('/')) &&
        new Set(excludedPaths).size === excludedPaths.length));
  const rootPathInScope =
    rootOrigin !== undefined &&
    rootScopeValid &&
    (paths.length === 0 || isPathWithin(finalUrl, rootOrigin, paths)) &&
    !excludedPaths.some((path) => isPathWithin(finalUrl, rootOrigin, [path]));
  if (!rootScopeValid) {
    findings.push(
      finding(
        'EOM_AUTHORITY_ROOT_SCOPE_INVALID',
        'security',
        'The root manifest scope contains malformed or duplicate path constraints.',
        { severity: 'error', pointer: '/scope' },
      ),
    );
  }
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
      subjectValid: true,
      keyScopeValid: 'not-evaluated',
      temporalValid: true,
      active: true,
      transitiveAllowed: false,
      trustLabel: 'root-linked',
      finalUrl,
      findings,
    };
  }

  let best: DelegationMatch | undefined;
  const delegationFindings: Finding[] = [];
  for (const delegation of delegations) {
    const match = evaluateDelegation(delegation, resource, finalUrl, now, options.verifiedKeyId);
    delegationFindings.push(...match.findings);
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
      subjectValid: best.subjectValid,
      keyScopeValid: best.keyScopeValid,
      temporalValid: best.temporalValid,
      active: best.active,
      transitiveAllowed: false,
      trustLabel: 'delegated',
      finalUrl,
      findings: [...findings, ...best.findings],
    };
  }
  if (!rootAuthority) {
    findings.push(...delegationFindings);
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
    subjectValid: false,
    keyScopeValid: options.verifiedKeyId === undefined ? 'not-evaluated' : false,
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
  readonly subjectValid: boolean;
  readonly keyScopeValid: boolean | 'not-evaluated';
  readonly temporalValid: boolean;
  readonly active: boolean;
  readonly findings: readonly Finding[];
}

function evaluateDelegation(
  delegation: unknown,
  resource: unknown,
  finalUrl: string,
  now: Date,
  verifiedKeyId: string | undefined,
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
  const validFromValue = stringAt(delegation, ['validFrom']);
  const validUntilValue = stringAt(delegation, ['validUntil']);
  const revokedAtValue = stringAt(delegation, ['revokedAt']);
  const validityInterval =
    validFrom !== undefined && validUntil !== undefined && validFrom < validUntil;
  if (validFromValue === undefined || validUntilValue === undefined) {
    findings.push(
      finding(
        'EOM_DELEGATION_VALIDITY_REQUIRED',
        'security',
        'A delegation must declare both validFrom and validUntil.',
        { severity: 'error', pointer: `${basePointer}/validUntil` },
      ),
    );
  } else if (validFrom === undefined || validUntil === undefined) {
    findings.push(
      finding(
        'EOM_DELEGATION_DATE_INVALID',
        'security',
        'Delegation validity timestamps must be valid date-time values.',
        { severity: 'error', pointer: `${basePointer}/validUntil` },
      ),
    );
  } else if (!validityInterval) {
    findings.push(
      finding(
        'EOM_DELEGATION_INTERVAL_INVALID',
        'security',
        'validFrom must be earlier than validUntil.',
        { severity: 'error', pointer: `${basePointer}/validUntil` },
      ),
    );
  }
  if (revokedAtValue !== undefined && revokedAt === undefined) {
    findings.push(
      finding(
        'EOM_DELEGATION_DATE_INVALID',
        'security',
        'Delegation revocation timestamps must be valid date-time values.',
        { severity: 'error', pointer: `${basePointer}/revokedAt` },
      ),
    );
  }
  const revocationValid = revokedAtValue === undefined || revokedAt !== undefined;
  const temporalValid =
    validFrom !== undefined &&
    validUntil !== undefined &&
    validityInterval &&
    validFrom <= now.getTime() &&
    validUntil >= now.getTime() &&
    revocationValid &&
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
  const scope = valueAt(delegation, ['scope']);
  const scopeRecord = isRecord(scope);
  const scopeKeys = scopeRecord ? Object.keys(scope) : [];
  const rawTypeScope = scopeRecord ? scope.resourceTypes : undefined;
  const rawIdScope = scopeRecord ? scope.resourceIds : undefined;
  const rawOriginScope = scopeRecord ? scope.allowedOrigins : undefined;
  const rawPathScope = scopeRecord ? scope.allowedPathPrefixes : undefined;
  const typeScope = Array.isArray(rawTypeScope) ? rawTypeScope.filter(isString) : [];
  const idScope = Array.isArray(rawIdScope) ? rawIdScope.filter(isString) : [];
  const allowedOrigins = Array.isArray(rawOriginScope) ? rawOriginScope.filter(isString) : [];
  const prefixes = Array.isArray(rawPathScope) ? rawPathScope.filter(isString) : [];
  const scopeValid =
    scopeRecord &&
    scopeKeys.some((key) =>
      ['resourceTypes', 'resourceIds', 'allowedOrigins', 'allowedPathPrefixes'].includes(key),
    ) &&
    scopeKeys.every((key) =>
      ['resourceTypes', 'resourceIds', 'allowedOrigins', 'allowedPathPrefixes'].includes(key),
    ) &&
    (rawTypeScope === undefined ||
      (Array.isArray(rawTypeScope) &&
        typeScope.length > 0 &&
        typeScope.every((value) => value.length > 0) &&
        new Set(typeScope).size === typeScope.length)) &&
    (rawIdScope === undefined ||
      (Array.isArray(rawIdScope) &&
        idScope.length > 0 &&
        idScope.every((value) => isAbsoluteUri(value)) &&
        new Set(idScope).size === idScope.length)) &&
    (rawOriginScope === undefined ||
      (Array.isArray(rawOriginScope) &&
        allowedOrigins.length > 0 &&
        allowedOrigins.every((value) => isHttpsUri(value)) &&
        new Set(allowedOrigins.map((value) => normalizeOrigin(value))).size ===
          allowedOrigins.length)) &&
    (rawPathScope === undefined ||
      (Array.isArray(rawPathScope) &&
        prefixes.length > 0 &&
        prefixes.every((value) => value.startsWith('/')) &&
        new Set(prefixes).size === prefixes.length));
  if (!scopeValid) {
    findings.push(
      finding(
        'EOM_DELEGATION_SCOPE_INVALID',
        'security',
        'A delegation must declare a valid non-empty scope without malformed or unknown dimensions.',
        { severity: 'error', pointer: `${basePointer}/scope` },
      ),
    );
  }
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
  const subjectValidValue = subject === undefined || isAbsoluteUri(subject);
  const subjects = [
    ...arrayAt(resource, ['subjects']).filter(isString),
    ...(stringAt(resource, ['subject']) ? [stringAt(resource, ['subject'])!] : []),
  ];
  const subjectValid = subjectValidValue && (subject === undefined || subjects.includes(subject));
  if (!subjectValidValue) {
    findings.push(
      finding(
        'EOM_DELEGATION_SUBJECT_INVALID',
        'security',
        'A declared delegation subject must be an absolute URI.',
        { severity: 'error', pointer: `${basePointer}/subject` },
      ),
    );
  }
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
  const rawKeys = valueAt(delegation, ['keys']);
  const hasKeyAllowlist = rawKeys !== undefined;
  const keys = arrayAt(delegation, ['keys']).filter(isString);
  const keyAllowlistValid =
    !hasKeyAllowlist ||
    (Array.isArray(rawKeys) &&
      rawKeys.length > 0 &&
      keys.length === rawKeys.length &&
      keys.every((key) => isAbsoluteUri(key)) &&
      new Set(keys).size === keys.length);
  if (!keyAllowlistValid) {
    findings.push(
      finding(
        'EOM_DELEGATION_KEYS_INVALID',
        'security',
        'A declared delegation key allowlist must contain one or more key identifiers.',
        { severity: 'error', pointer: `${basePointer}/keys` },
      ),
    );
  }
  const keyScopeValid: boolean | 'not-evaluated' =
    verifiedKeyId === undefined
      ? 'not-evaluated'
      : keyAllowlistValid && (!hasKeyAllowlist || keys.includes(verifiedKeyId));
  if (keyScopeValid === false) {
    findings.push(
      finding(
        'EOM_DELEGATION_KEY_OUT_OF_SCOPE',
        'security',
        'The verified signing key is not included in the delegation key allowlist.',
        {
          severity: 'error',
          pointer: `${basePointer}/keys`,
          related: verifiedKeyId === undefined ? [] : [verifiedKeyId],
        },
      ),
    );
  }
  const accepted =
    active &&
    transitive === false &&
    scopeValid &&
    temporalValid &&
    resourceTypeInScope &&
    resourceIdInScope &&
    originInScope &&
    pathInScope &&
    subjectValid &&
    keyAllowlistValid &&
    (keyScopeValid === 'not-evaluated' || keyScopeValid);
  return {
    accepted,
    resourceTypeInScope,
    resourceIdInScope,
    originInScope,
    pathInScope,
    subjectValid,
    keyScopeValid,
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
  if (!candidate || !isDateTime(candidate)) return undefined;
  const parsed = Date.parse(candidate);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function isDateTime(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
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
