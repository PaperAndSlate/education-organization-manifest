import { finding, type Finding } from '@paperandslate/eom-core/findings';
import {
  isAbsoluteUri,
  isHttpsUri,
  isSameOrigin,
  isPathWithin,
  normalizeOrigin,
  originOf,
} from '@paperandslate/eom-core/ids';
import { parseDateTime } from '@paperandslate/eom-core/time';

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
  /** The URL from which the root manifest was actually observed. */
  readonly observedRootUrl?: string;
  /** Require transport evidence before treating root-origin authority as trusted. */
  readonly requireObservedRoot?: boolean;
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

/**
 * Bind a manifest resource descriptor to the document returned for its href.
 *
 * A descriptor is trusted input from the root manifest, while the fetched
 * document is untrusted until its identity fields agree with that descriptor.
 * Keep this comparison strict and limited to the stable resource identity
 * fields so redirects can change transport location without changing what was
 * declared.
 */
export function resourceDescriptorMatchesDocument(descriptor: unknown, document: unknown): boolean {
  if (!isRecord(descriptor) || !isRecord(document)) return false;
  const descriptorId = stringAt(descriptor, ['id']);
  const descriptorType = stringAt(descriptor, ['type']);
  const descriptorHref = stringAt(descriptor, ['href']);
  const documentId = stringAt(document, ['id']);
  const documentType = stringAt(document, ['type']);
  const documentCanonical = stringAt(document, ['canonical']);
  if (
    descriptorId === undefined ||
    !isAbsoluteUri(descriptorId) ||
    descriptorType === undefined ||
    descriptorType.length === 0 ||
    typeof descriptorHref !== 'string' ||
    !isHttpsUri(descriptorHref) ||
    typeof documentId !== 'string' ||
    !isAbsoluteUri(documentId) ||
    (documentCanonical !== undefined && !isHttpsUri(documentCanonical)) ||
    descriptorType !== documentType ||
    (descriptorId !== documentId && descriptorHref !== documentCanonical)
  ) {
    return false;
  }
  const rawDeclaredSubjects = valueAt(descriptor, ['subjects']);
  const declaredSubjects = arrayAt(descriptor, ['subjects']);
  if (
    !isDenseArray(rawDeclaredSubjects) ||
    declaredSubjects.length === 0 ||
    !declaredSubjects.every((subject) => typeof subject === 'string' && isAbsoluteUri(subject))
  ) {
    return false;
  }
  const rawObservedSubjects = valueAt(document, ['subjects']);
  if (hasOwnAt(document, ['subjects']) && !isDenseArray(rawObservedSubjects)) return false;
  const rawObservedSubject = valueAt(document, ['subject']);
  if (hasOwnAt(document, ['subject']) && typeof rawObservedSubject !== 'string') return false;
  const observedSubjects = [
    ...arrayAt(document, ['subjects']).filter(isString),
    ...(typeof rawObservedSubject === 'string' ? [rawObservedSubject] : []),
    ...(typeof documentId === 'string' ? [documentId] : []),
  ];
  return declaredSubjects.every((subject) => observedSubjects.includes(subject));
}

/** Return whether a fetched root manifest is bound to the origin that served it. */
export function rootManifestOriginMatchesObserved(
  manifest: unknown,
  observedRootUrl: string,
): boolean {
  const observedOrigin = safeHttpsOrigin(observedRootUrl);
  const declaredOrigin = safeHttpsOrigin(stringAt(manifest, ['scope', 'origin']));
  const canonicalValue = stringAt(manifest, ['canonical']);
  if (hasOwnAt(manifest, ['canonical']) && canonicalValue === undefined) return false;
  const canonicalOrigin =
    canonicalValue === undefined ? undefined : safeHttpsOrigin(canonicalValue);
  if (observedOrigin === undefined || declaredOrigin === undefined) return false;
  if (canonicalValue !== undefined) {
    return (
      canonicalOrigin !== undefined &&
      normalizeOrigin(declaredOrigin) === normalizeOrigin(observedOrigin) &&
      normalizeOrigin(canonicalOrigin) === normalizeOrigin(observedOrigin)
    );
  }
  return normalizeOrigin(declaredOrigin) === normalizeOrigin(observedOrigin);
}

function safeHttpsOrigin(value: unknown): string | undefined {
  return isHttpsUri(value) ? originOf(value) : undefined;
}

function resourceAuthorityShapeIsValid(resource: unknown): boolean {
  if (!isRecord(resource)) return false;
  const authority = valueAt(resource, ['authority']);
  if (!Object.hasOwn(resource, 'authority')) return true;
  if (!isRecord(authority)) return false;
  const authorityKeys = Object.keys(authority);
  if (authorityKeys.some((key) => !['delegation', 'origin'].includes(key))) return false;
  const delegation = valueAt(authority, ['delegation']);
  const origin = valueAt(authority, ['origin']);
  return (
    typeof delegation === 'string' &&
    isAbsoluteUri(delegation) &&
    (!Object.hasOwn(authority, 'origin') || isHttpsUri(origin))
  );
}

function resourceIdentityIsValid(resource: unknown): boolean {
  const type = stringAt(resource, ['type']);
  const id = stringAt(resource, ['id']);
  return (
    isRecord(resource) &&
    type !== undefined &&
    type.trim().length > 0 &&
    id !== undefined &&
    isAbsoluteUri(id)
  );
}

function rejectedAuthorityResult(
  finalUrl: string,
  delegationPresent: boolean,
  findings: readonly Finding[],
  verifiedKeyId: string | undefined,
): AuthorityResult {
  return {
    accepted: false,
    rootAuthority: false,
    delegationPresent,
    resourceTypeInScope: false,
    resourceIdInScope: false,
    originInScope: false,
    pathInScope: false,
    subjectValid: false,
    keyScopeValid: verifiedKeyId === undefined ? 'not-evaluated' : false,
    temporalValid: false,
    active: false,
    transitiveAllowed: false,
    trustLabel: 'unverified-external',
    finalUrl,
    findings: uniqueFindings(findings),
  };
}

/** Evaluate root-origin and explicitly scoped cross-origin authority without fetching. */
export function evaluateAuthority(
  manifest: unknown,
  resource: unknown,
  finalUrl: string,
  options: AuthorityOptions = {},
): AuthorityResult {
  const candidateNow = options.now ?? new Date();
  const evaluationTimeValid = isValidDate(candidateNow);
  const now = evaluationTimeValid ? candidateNow : new Date(0);
  const rawScopeOrigin = stringAt(manifest, ['scope', 'origin']);
  const rawCanonical = stringAt(manifest, ['canonical']);
  const rootOriginInput = rawScopeOrigin ?? rawCanonical;
  const rootOrigin = safeHttpsOrigin(rootOriginInput);
  const canonicalOrigin = safeHttpsOrigin(rawCanonical);
  const finalUrlValid = isHttpsUri(finalUrl);
  const rootOriginValid = rawScopeOrigin !== undefined && rootOrigin !== undefined;
  const canonicalValid = !hasOwnAt(manifest, ['canonical']) || canonicalOrigin !== undefined;
  const rawDelegations = valueAt(manifest, ['delegations']);
  const delegationsValid =
    !hasOwnAt(manifest, ['delegations']) ||
    (isDenseArray(rawDelegations) && rawDelegations.every((delegation) => isRecord(delegation)));
  const resourceIdentityValid = resourceIdentityIsValid(resource);
  const resourceAuthorityValid = resourceAuthorityShapeIsValid(resource);
  const declaredResourceOrigin = stringAt(resource, ['authority', 'origin']);
  const finalOrigin = finalUrlValid ? originOf(finalUrl) : undefined;
  const resourceOriginInScope =
    declaredResourceOrigin === undefined ||
    (finalOrigin !== undefined &&
      safeHttpsOrigin(declaredResourceOrigin) !== undefined &&
      normalizeOrigin(declaredResourceOrigin) === normalizeOrigin(finalOrigin));
  const findings: Finding[] = [];
  if (!evaluationTimeValid) {
    findings.push(
      finding(
        'EOM_AUTHORITY_TIME_INVALID',
        'security',
        'Authority evaluation requires a valid evaluation time.',
        { severity: 'error' },
      ),
    );
  }
  if (!rootOriginValid) {
    findings.push(
      finding(
        'EOM_AUTHORITY_ROOT_ORIGIN_INVALID',
        'security',
        'Root authority requires a valid HTTPS scope origin.',
        { severity: 'error', pointer: '/scope/origin' },
      ),
    );
  }
  if (!finalUrlValid) {
    findings.push(
      finding(
        'EOM_AUTHORITY_FINAL_URL_INVALID',
        'security',
        'Authority evaluation requires an absolute HTTPS final URL without userinfo.',
        { severity: 'error', related: [finalUrl] },
      ),
    );
  }
  if (!canonicalValid) {
    findings.push(
      finding(
        'EOM_AUTHORITY_ROOT_CANONICAL_INVALID',
        'security',
        'A root manifest canonical URL must be an HTTPS URL without userinfo.',
        { severity: 'error', pointer: '/canonical' },
      ),
    );
  }
  if (!delegationsValid) {
    findings.push(
      finding(
        'EOM_AUTHORITY_DELEGATIONS_INVALID',
        'security',
        'Root manifest delegations must be an array of delegation objects.',
        { severity: 'error', pointer: '/delegations' },
      ),
    );
  }
  if (!resourceIdentityValid) {
    findings.push(
      finding(
        'EOM_AUTHORITY_RESOURCE_IDENTITY_INVALID',
        'security',
        'Authority evaluation requires a resource object with a non-empty type and absolute id.',
        { severity: 'error', pointer: '/resources' },
      ),
    );
  }
  if (!resourceAuthorityValid) {
    findings.push(
      finding(
        'EOM_AUTHORITY_RESOURCE_AUTHORITY_INVALID',
        'security',
        'A resource authority value must be an object with an absolute delegation id and optional HTTPS origin.',
        { severity: 'error', pointer: '/authority' },
      ),
    );
  }
  if (!resourceOriginInScope) {
    findings.push(
      finding(
        'EOM_AUTHORITY_DECLARED_ORIGIN_MISMATCH',
        'security',
        'The resource authority origin does not match the observed final URL origin.',
        { severity: 'error', pointer: '/authority/origin', related: [finalUrl] },
      ),
    );
  }
  const observedRootMissing =
    options.requireObservedRoot === true && options.observedRootUrl === undefined;
  const rootIdentityBound = observedRootMissing
    ? false
    : options.observedRootUrl === undefined
      ? true
      : rootManifestOriginMatchesObserved(manifest, options.observedRootUrl);
  if (observedRootMissing) {
    findings.push(
      finding(
        'EOM_AUTHORITY_ROOT_OBSERVATION_REQUIRED',
        'security',
        'Root authority requires the URL from which the root manifest was observed.',
        { severity: 'error', pointer: '/scope/origin' },
      ),
    );
  } else if (options.observedRootUrl !== undefined && !rootIdentityBound) {
    findings.push(
      finding(
        'EOM_AUTHORITY_ROOT_ORIGIN_MISMATCH',
        'security',
        'The root manifest authority origin does not match the origin from which the manifest was observed.',
        {
          severity: 'error',
          pointer: '/scope/origin',
          related: [
            options.observedRootUrl,
            ...(rootOrigin === undefined ? [] : [rootOrigin]),
            ...(canonicalOrigin === undefined ? [] : [canonicalOrigin]),
          ],
        },
      ),
    );
  }
  const rootAuthority =
    evaluationTimeValid &&
    rootOriginValid &&
    canonicalValid &&
    delegationsValid &&
    finalUrlValid &&
    resourceOriginInScope &&
    rootIdentityBound &&
    rootOrigin !== undefined &&
    finalOrigin !== undefined &&
    isSameOrigin(finalUrl, rootOrigin);
  const paths = arrayAt(manifest, ['scope', 'paths']).filter(isString);
  const excludedPaths = arrayAt(manifest, ['scope', 'excludedPaths']).filter(isString);
  const rawPaths = valueAt(manifest, ['scope', 'paths']);
  const rawExcludedPaths = valueAt(manifest, ['scope', 'excludedPaths']);
  const rootScopeValid =
    (!hasOwnAt(manifest, ['scope', 'paths']) ||
      (isDenseArray(rawPaths) &&
        rawPaths.every((path) => isString(path) && path.startsWith('/')) &&
        new Set(paths).size === paths.length)) &&
    (!hasOwnAt(manifest, ['scope', 'excludedPaths']) ||
      (isDenseArray(rawExcludedPaths) &&
        rawExcludedPaths.every((path) => isString(path) && path.startsWith('/')) &&
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
  const declaredDelegationId = stringAt(resource, ['authority', 'delegation']);
  const applicableDelegations =
    declaredDelegationId === undefined
      ? delegations
      : delegations.filter((delegation) => stringAt(delegation, ['id']) === declaredDelegationId);
  if (declaredDelegationId !== undefined && applicableDelegations.length === 0) {
    findings.push(
      finding(
        'EOM_DELEGATION_REFERENCE_NOT_FOUND',
        'security',
        'The resource authority descriptor references a delegation that is not present in the root manifest.',
        {
          severity: 'error',
          pointer: '/authority/delegation',
          related: [declaredDelegationId],
        },
      ),
    );
  }
  const explicitlyDelegated = declaredDelegationId !== undefined;
  if (
    !rootOriginValid ||
    !canonicalValid ||
    !delegationsValid ||
    !finalUrlValid ||
    !resourceIdentityValid ||
    !resourceAuthorityValid ||
    !resourceOriginInScope ||
    !evaluationTimeValid
  ) {
    return rejectedAuthorityResult(finalUrl, delegationPresent, findings, options.verifiedKeyId);
  }
  if (rootAuthority && rootPathInScope && !explicitlyDelegated) {
    if (declaredDelegationId !== undefined && applicableDelegations.length === 0) {
      return {
        accepted: false,
        rootAuthority: true,
        delegationPresent,
        resourceTypeInScope: true,
        resourceIdInScope: true,
        originInScope: true,
        pathInScope: true,
        subjectValid: false,
        keyScopeValid: options.verifiedKeyId === undefined ? 'not-evaluated' : false,
        temporalValid: false,
        active: false,
        transitiveAllowed: false,
        trustLabel: 'unverified-external',
        finalUrl,
        findings,
      };
    }
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
  if (!rootIdentityBound && (options.observedRootUrl !== undefined || observedRootMissing)) {
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
      findings,
    };
  }

  let best: DelegationMatch | undefined;
  const delegationFindings: Finding[] = [];
  for (const delegation of applicableDelegations) {
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
  if (explicitlyDelegated || !rootAuthority) {
    findings.push(...delegationFindings);
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
  const delegationId = stringAt(delegation, ['id']);
  const delegationIdValid = delegationId !== undefined && isAbsoluteUri(delegationId);
  const delegate = valueAt(delegation, ['delegate']);
  const delegateValid =
    (typeof delegate === 'string' && isHttpsUri(delegate)) ||
    (isRecord(delegate) &&
      typeof valueAt(delegate, ['id']) === 'string' &&
      isAbsoluteUri(valueAt(delegate, ['id'])) &&
      localizedNameIsValid(valueAt(delegate, ['name'])));
  if (!delegationIdValid) {
    findings.push(
      finding(
        'EOM_DELEGATION_ID_INVALID',
        'security',
        'A delegation must declare an absolute URI id.',
        { severity: 'error', pointer: `${basePointer}/id` },
      ),
    );
  }
  if (!delegateValid) {
    findings.push(
      finding(
        'EOM_DELEGATION_DELEGATE_INVALID',
        'security',
        'A delegation must identify a valid HTTPS delegate or delegated organization record.',
        { severity: 'error', pointer: `${basePointer}/delegate` },
      ),
    );
  }
  const typeValid = stringAt(delegation, ['type']) === 'delegation';
  if (!typeValid) {
    findings.push(
      finding(
        'EOM_DELEGATION_TYPE_INVALID',
        'structural',
        'An authority delegation must declare type=delegation.',
        { severity: 'error', pointer: `${basePointer}/type` },
      ),
    );
  }
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
  const rawTypeScope = scopeRecord ? valueAt(scope, ['resourceTypes']) : undefined;
  const rawIdScope = scopeRecord ? valueAt(scope, ['resourceIds']) : undefined;
  const rawOriginScope = scopeRecord ? valueAt(scope, ['allowedOrigins']) : undefined;
  const rawPathScope = scopeRecord ? valueAt(scope, ['allowedPathPrefixes']) : undefined;
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
    (!hasOwnAt(delegation, ['scope', 'resourceTypes']) ||
      (isDenseArray(rawTypeScope) &&
        rawTypeScope.every(isString) &&
        typeScope.length > 0 &&
        typeScope.every((value) => value.length > 0) &&
        new Set(typeScope).size === typeScope.length)) &&
    (!hasOwnAt(delegation, ['scope', 'resourceIds']) ||
      (isDenseArray(rawIdScope) &&
        rawIdScope.every(isString) &&
        idScope.length > 0 &&
        idScope.every((value) => isAbsoluteUri(value)) &&
        new Set(idScope).size === idScope.length)) &&
    (!hasOwnAt(delegation, ['scope', 'allowedOrigins']) ||
      (isDenseArray(rawOriginScope) &&
        rawOriginScope.every(isString) &&
        allowedOrigins.length > 0 &&
        allowedOrigins.every((value) => isHttpsUri(value)) &&
        new Set(allowedOrigins.map((value) => normalizeOrigin(value))).size ===
          allowedOrigins.length)) &&
    (!hasOwnAt(delegation, ['scope', 'allowedPathPrefixes']) ||
      (isDenseArray(rawPathScope) &&
        rawPathScope.every(isString) &&
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
  const subjectPresent = hasOwnAt(delegation, ['subject']);
  const subject = stringAt(delegation, ['subject']);
  const subjectValidValue = !subjectPresent || (subject !== undefined && isAbsoluteUri(subject));
  const subjects = [
    ...arrayAt(resource, ['subjects']).filter(isString),
    ...(stringAt(resource, ['subject']) ? [stringAt(resource, ['subject'])!] : []),
  ];
  const subjectValid = subjectValidValue && (!subjectPresent || subjects.includes(subject!));
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
  const hasKeyAllowlist = hasOwnAt(delegation, ['keys']);
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
    delegationIdValid &&
    delegateValid &&
    typeValid &&
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

function localizedNameIsValid(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (!isRecord(value)) return false;
  const defaultLanguage = valueAt(value, ['default']);
  const values = valueAt(value, ['values']);
  return (
    typeof defaultLanguage === 'string' &&
    defaultLanguage.length > 0 &&
    isRecord(values) &&
    Object.keys(values).length > 0 &&
    Object.values(values).every((item) => typeof item === 'string' && item.length > 0)
  );
}

function dateAt(value: unknown, path: readonly string[]): number | undefined {
  const candidate = stringAt(value, path);
  return parseDateTime(candidate);
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function valueAt(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (!isRecord(current) || !Object.hasOwn(current, segment)) return undefined;
    current = current[segment];
  }
  return current;
}

function hasOwnAt(value: unknown, path: readonly string[]): boolean {
  let current = value;
  for (const segment of path) {
    if (!isRecord(current) || !Object.hasOwn(current, segment)) return false;
    current = current[segment];
  }
  return true;
}

function stringAt(value: unknown, path: readonly string[]): string | undefined {
  const candidate = valueAt(value, path);
  return typeof candidate === 'string' ? candidate : undefined;
}

function arrayAt(value: unknown, path: readonly string[]): readonly unknown[] {
  const candidate = valueAt(value, path);
  return isDenseArray(candidate) ? candidate : [];
}

function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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
