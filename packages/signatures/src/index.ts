import {
  createHash,
  createPublicKey,
  sign,
  verify,
  type JsonWebKey as NodeJsonWebKey,
  type KeyObject,
} from 'node:crypto';
import {
  parseStrictJson,
  isJsonObject,
  type JsonObject,
  type JsonValue,
} from '@paperandslate/eom-core';
import { parseDateTime } from '@paperandslate/eom-core/time';
import {
  evaluateAuthority,
  resourceDescriptorMatchesDocument,
  type AuthorityResult,
} from '@paperandslate/eom-authority';
import { finding, type Finding } from '@paperandslate/eom-core';

export interface SignOptions {
  readonly privateKey: KeyObject | string | Uint8Array;
  readonly keyId: string;
  readonly subject?: string;
  readonly signatureId?: string;
  readonly canonical?: string;
  readonly createdAt?: Date | string;
  readonly expires?: Date | string;
}

export interface DetachedSignatureRecord {
  readonly $schema: string;
  readonly specification: string;
  readonly version: '1.0';
  readonly id: string;
  readonly type: 'signature';
  readonly canonical: string;
  readonly subject: string;
  readonly keyId: string;
  readonly algorithm: 'EdDSA';
  readonly canonicalization: 'RFC8785-JCS';
  readonly payloadDigest: string;
  readonly protected: string;
  readonly signature: string;
  readonly compact: string;
  readonly detached: true;
  readonly createdAt: string;
  readonly expires?: string;
  readonly contentType: 'application/json';
}

export interface KeyRecordOptions {
  readonly keyId: string;
  readonly status?: 'active' | 'revoked' | 'expired';
  readonly purpose?: string;
  readonly owner?: string;
  readonly validFrom?: string;
  readonly validUntil?: string;
  readonly revokedAt?: string;
  readonly successor?: string;
  readonly scope?: {
    readonly resourceTypes?: readonly string[];
    readonly resourceIds?: readonly string[];
  };
}

export interface VerificationOptions {
  readonly now?: Date;
  readonly manifest?: unknown;
  readonly resource?: unknown;
  /**
   * The manifest descriptor used for authority evaluation. This is separate
   * from `resource` because a fetched document may use a document/entity id
   * while the descriptor carries the resource id constrained by delegation.
   */
  readonly authorityResource?: unknown;
  readonly finalUrl?: string;
  /** The observed root-manifest URL, when the caller has transport context. */
  readonly observedRootUrl?: string;
}

export interface SignatureVerificationResult {
  readonly canonicalizationValid: boolean;
  readonly digestMatch: boolean;
  readonly signatureValid: boolean;
  readonly keyTemporalValid: boolean;
  readonly keyRevoked: boolean;
  readonly keySetExpiryValid: boolean;
  readonly keyScopeValid: boolean;
  readonly delegationScopeValid: boolean | 'not-evaluated';
  readonly rootAuthorityStatus: 'accepted' | 'rejected' | 'not-evaluated';
  readonly resourceExpiryValid: boolean;
  readonly signatureExpiryValid: boolean;
  readonly subjectMatch: boolean;
  readonly unsigned: false;
  readonly overall: boolean;
  readonly findings: readonly Finding[];
  readonly authority?: AuthorityResult;
}

export interface UnsignedVerificationResult {
  readonly canonicalizationValid: boolean;
  readonly digestMatch: 'not-applicable';
  readonly signatureValid: 'not-applicable';
  readonly keyTemporalValid: 'not-applicable';
  readonly keyRevoked: false;
  readonly keyScopeValid: 'not-evaluated';
  readonly delegationScopeValid: 'not-evaluated';
  readonly rootAuthorityStatus: 'not-evaluated';
  readonly resourceExpiryValid: boolean;
  readonly subjectMatch: 'not-applicable';
  readonly unsigned: true;
  readonly overall: boolean;
  readonly findings: readonly Finding[];
}

const SPECIFICATION = 'https://paperandslate.org/spec/eom/1.0';
const SIGNATURE_SCHEMA = 'https://paperandslate.org/schemas/eom/1.0/signature.schema.json';
const KEY_SET_SCHEMA = 'https://paperandslate.org/schemas/eom/1.0/key-set.schema.json';
const MAX_SIGNATURE_JSON_DEPTH = 128;
const MAX_SIGNATURE_JSON_NODES = 100_000;
const MAX_SIGNATURE_JSON_BYTES = 32 * 1024 * 1024;

/** Canonicalize JSON using the EOM RFC 8785 JCS profile. */
export function canonicalizeJson(value: unknown): string {
  if (!isJsonValue(value))
    throw new SignaturePolicyError(
      'EOM_CANONICALIZATION_VALUE',
      'Only finite JSON values can be canonicalized.',
    );
  const canonical = canonicalValue(value);
  if (Buffer.byteLength(canonical, 'utf8') > MAX_SIGNATURE_JSON_BYTES) {
    throw new SignaturePolicyError(
      'EOM_CANONICALIZATION_SIZE',
      `Canonical JSON exceeds the ${MAX_SIGNATURE_JSON_BYTES}-byte safety limit.`,
    );
  }
  return canonical;
}

export function canonicalizeJsonText(text: string, source = 'JSON input'): string {
  return canonicalizeJson(parseStrictJson(text, source));
}

export function contentDigest(value: unknown): string {
  return digestBytes(Buffer.from(canonicalizeJson(value), 'utf8'));
}

export function signDetached(value: unknown, options: SignOptions): DetachedSignatureRecord {
  const resourceId = stringAt(value, ['id']);
  const subject = options.subject ?? resourceId;
  if (
    !resourceId ||
    !isAbsoluteHttpsOrUri(resourceId) ||
    !subject ||
    !isAbsoluteHttpsOrUri(subject)
  ) {
    throw new SignaturePolicyError(
      'EOM_SIGNATURE_SUBJECT_REQUIRED',
      'A signed resource must have an absolute id.',
    );
  }
  if (subject !== resourceId) {
    throw new SignaturePolicyError(
      'EOM_SIGNATURE_SUBJECT_MISMATCH',
      'A detached signature subject must match the signed resource id.',
    );
  }
  if (!isAbsoluteHttpsOrUri(options.keyId)) {
    throw new SignaturePolicyError(
      'EOM_SIGNATURE_KEY_ID_REQUIRED',
      'A signature key id must be an absolute URI.',
    );
  }
  const payload = canonicalizeJson(value);
  const createdAt = toIso(options.createdAt ?? new Date());
  const expires = options.expires === undefined ? undefined : toIso(options.expires);
  if (expires !== undefined && Date.parse(createdAt) >= Date.parse(expires)) {
    throw new SignaturePolicyError(
      'EOM_SIGNATURE_TIME_INVALID',
      'Signature expires must be later than its creation time.',
    );
  }
  const protectedHeader = {
    alg: 'EdDSA',
    b64: false,
    crit: ['b64', 'eom'],
    cty: 'application/json',
    eom: {
      version: '1.0',
      canonicalization: 'RFC8785-JCS',
      createdAt,
      ...(expires === undefined ? {} : { expires }),
    },
    kid: options.keyId,
  } as const;
  const protectedValue = encodeBase64Url(Buffer.from(JSON.stringify(protectedHeader), 'utf8'));
  const signingInput = Buffer.concat([
    Buffer.from(`${protectedValue}.`, 'ascii'),
    Buffer.from(payload, 'utf8'),
  ]);
  const signatureBytes = sign(null, signingInput, normalizePrivateKey(options.privateKey));
  const signature = encodeBase64Url(signatureBytes);
  const digest = digestBytes(Buffer.from(payload, 'utf8'));
  const signatureId = options.signatureId ?? `${subject}#signature-${digest.slice(-16)}`;
  const canonical = options.canonical ?? `${subject}#signature`;
  if (!isAbsoluteHttpsOrUri(signatureId)) {
    throw new SignaturePolicyError(
      'EOM_SIGNATURE_ID_REQUIRED',
      'A detached signature id must be an absolute URI.',
    );
  }
  if (!isHttpsUri(canonical)) {
    throw new SignaturePolicyError(
      'EOM_SIGNATURE_CANONICAL_REQUIRED',
      'A detached signature canonical value must be an HTTPS URL.',
    );
  }
  return {
    $schema: SIGNATURE_SCHEMA,
    specification: SPECIFICATION,
    version: '1.0',
    id: signatureId,
    type: 'signature',
    canonical,
    subject,
    keyId: options.keyId,
    algorithm: 'EdDSA',
    canonicalization: 'RFC8785-JCS',
    payloadDigest: digest,
    protected: protectedValue,
    signature,
    compact: `${protectedValue}..${signature}`,
    detached: true,
    createdAt,
    ...(expires === undefined ? {} : { expires }),
    contentType: 'application/json',
  };
}

export function publicKeyRecord(publicKey: KeyObject, options: KeyRecordOptions): JsonObject {
  const jwk = publicKey.export({ format: 'jwk' }) as { kty?: unknown; crv?: unknown; x?: unknown };
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || typeof jwk.x !== 'string') {
    throw new SignaturePolicyError(
      'EOM_SIGNATURE_KEY_ALGORITHM',
      'Only Ed25519 public keys are allowed.',
    );
  }
  const record: Record<string, unknown> = {
    kid: options.keyId,
    kty: 'OKP',
    use: 'sig',
    alg: 'EdDSA',
    status: options.status ?? 'active',
    publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: jwk.x },
  };
  for (const key of [
    'purpose',
    'owner',
    'validFrom',
    'validUntil',
    'revokedAt',
    'successor',
    'scope',
  ] as const) {
    const value = options[key];
    if (value !== undefined) record[key] = value;
  }
  return asJsonObject(record);
}

export function verifyDetached(
  value: unknown,
  signature: unknown,
  keySet: unknown,
  options: VerificationOptions = {},
): SignatureVerificationResult {
  const candidateNow = options.now ?? new Date();
  const evaluationTimeValid = isValidDate(candidateNow);
  const now = evaluationTimeValid ? candidateNow : new Date(0);
  const findings: Finding[] = [];
  if (!evaluationTimeValid) {
    findings.push(
      finding(
        'EOM_SIGNATURE_TIME_INVALID',
        'security',
        'Signature verification requires a valid evaluation time.',
        { severity: 'error' },
      ),
    );
  }
  let canonicalPayload: string | undefined;
  try {
    canonicalPayload = canonicalizeJson(value);
  } catch (error) {
    findings.push(
      finding(
        'EOM_SIGNATURE_CANONICALIZATION_FAILED',
        'integrity',
        error instanceof Error ? error.message : 'Canonicalization failed.',
        {
          severity: 'error',
        },
      ),
    );
  }
  const canonicalizationValid = canonicalPayload !== undefined;
  const expectedDigest = canonicalPayload
    ? digestBytes(Buffer.from(canonicalPayload, 'utf8'))
    : undefined;
  const payloadDigest = stringAt(signature, ['payloadDigest']);
  const digestMatch = expectedDigest !== undefined && expectedDigest === payloadDigest;
  if (!digestMatch) {
    findings.push(
      finding(
        'EOM_SIGNATURE_DIGEST_MISMATCH',
        'integrity',
        'The detached signature digest does not match canonical resource bytes.',
        { severity: 'error' },
      ),
    );
  }
  const protectedValue = stringAt(signature, ['protected']);
  const signatureValue = stringAt(signature, ['signature']);
  const keyId = stringAt(signature, ['keyId']);
  const subject = stringAt(signature, ['subject']);
  const header = decodeProtectedHeader(protectedValue, findings);
  const recordProfileValid = validateSignatureRecord(
    signature,
    protectedValue,
    signatureValue,
    findings,
  );
  const headerValid =
    recordProfileValid &&
    header !== undefined &&
    validateProtectedHeader(header, keyId, signature, findings);
  const keyRecord = keyId ? findKey(keySet, keyId) : undefined;
  const keySetValid = validateKeySet(keySet, findings);
  const manifestKeySetBindingValid = validateManifestKeySetBinding(
    options.manifest,
    keySet,
    findings,
  );
  const keyRecordValid = keyRecord === undefined || validateKeyRecord(keyRecord, findings);
  const keyScopeValid = evaluateKeyScope(keyRecord, value, findings);
  const keySetExpiryValid = isResourceCurrent(keySet, now);
  if (!keySetExpiryValid) {
    findings.push(
      finding(
        'EOM_SIGNATURE_KEY_SET_EXPIRED',
        'freshness',
        'The verification key set is past its declared expiry.',
        { severity: 'error', pointer: '/expires' },
      ),
    );
  }
  if (!keyRecord) {
    findings.push(
      finding(
        'EOM_SIGNATURE_KEY_NOT_FOUND',
        'integrity',
        'The signature key id is not present in the supplied key set.',
        { severity: 'error', related: keyId ? [keyId] : [] },
      ),
    );
  }
  const keyRevoked =
    keyRecord !== undefined &&
    (stringAt(keyRecord, ['status']) === 'revoked' || isPast(keyRecord, ['revokedAt'], now));
  if (keyRevoked)
    findings.push(
      finding('EOM_SIGNATURE_KEY_REVOKED', 'security', 'The signing key is revoked.', {
        severity: 'error',
        related: keyId ? [keyId] : [],
      }),
    );
  const keyTemporalValid =
    keyRecord !== undefined &&
    !keyRevoked &&
    stringAt(keyRecord, ['status']) !== 'expired' &&
    isWithinKeyPeriod(keyRecord, now);
  if (!keyTemporalValid)
    findings.push(
      finding(
        'EOM_SIGNATURE_KEY_TIME_INVALID',
        'security',
        'The signing key is not valid at the verification time.',
        { severity: 'error', related: keyId ? [keyId] : [] },
      ),
    );
  const subjectMatch = subject !== undefined && subject === stringAt(value, ['id']);
  if (!subjectMatch)
    findings.push(
      finding(
        'EOM_SIGNATURE_SUBJECT_MISMATCH',
        'integrity',
        'The detached signature subject does not match the resource id.',
        { severity: 'error' },
      ),
    );
  let signatureValid = false;
  if (
    canonicalPayload &&
    protectedValue &&
    signatureValue &&
    headerValid &&
    keySetValid &&
    manifestKeySetBindingValid &&
    keyRecordValid &&
    keyRecord
  ) {
    try {
      const publicKey = publicKeyFromRecord(keyRecord);
      const signingInput = Buffer.concat([
        Buffer.from(`${protectedValue}.`, 'ascii'),
        Buffer.from(canonicalPayload, 'utf8'),
      ]);
      signatureValid = verify(null, signingInput, publicKey, decodeBase64Url(signatureValue));
    } catch (error) {
      findings.push(
        finding(
          'EOM_SIGNATURE_CRYPTOGRAPHIC_FAILURE',
          'integrity',
          error instanceof Error ? error.message : 'The signature could not be verified.',
          { severity: 'error' },
        ),
      );
    }
  }
  if (!signatureValid)
    findings.push(
      finding('EOM_SIGNATURE_INVALID', 'integrity', 'The detached Ed25519 signature is invalid.', {
        severity: 'error',
      }),
    );
  const resourceExpiryValid = isResourceCurrent(value, now);
  if (!resourceExpiryValid)
    findings.push(
      finding(
        'EOM_SIGNATURE_RESOURCE_EXPIRED',
        'freshness',
        'The signed resource is past its declared expiry.',
        { severity: 'error' },
      ),
    );
  const signatureExpiryValid = isResourceCurrent(signature, now);
  if (!signatureExpiryValid)
    findings.push(
      finding(
        'EOM_SIGNATURE_EXPIRED',
        'freshness',
        'The detached signature record is past its declared expiry.',
        { severity: 'error' },
      ),
    );
  let authority: AuthorityResult | undefined;
  // `resource` is the signed document retained for compatibility.  It is not
  // a substitute for the trusted descriptor copied from the root manifest:
  // using the document itself here would let a caller manufacture an
  // authority context that was never declared by the manifest.
  const authorityResource = options.authorityResource;
  const authorityContextRequested =
    options.manifest !== undefined ||
    options.resource !== undefined ||
    options.authorityResource !== undefined ||
    options.finalUrl !== undefined ||
    options.observedRootUrl !== undefined;
  const authorityContextComplete =
    options.manifest !== undefined &&
    typeof options.finalUrl === 'string' &&
    options.finalUrl.length > 0 &&
    typeof options.observedRootUrl === 'string' &&
    options.observedRootUrl.length > 0 &&
    authorityResource !== undefined;
  let authorityContextValid = true;
  let authorityDescriptorValid = true;
  if (authorityContextRequested) {
    if (!authorityContextComplete) {
      authorityContextValid = false;
      findings.push(
        finding(
          'EOM_AUTHORITY_CONTEXT_REQUIRED',
          'security',
          'Authority-aware signature verification requires a manifest, observed final URL, fetched resource descriptor, and observed root-manifest URL.',
          { severity: 'error', pointer: '/manifest' },
        ),
      );
    } else if (!resourceDescriptorMatchesDocument(authorityResource, value)) {
      authorityDescriptorValid = false;
      findings.push(
        finding(
          'EOM_AUTHORITY_DESCRIPTOR_MISMATCH',
          'security',
          'The signed resource does not match the manifest resource descriptor used for authority evaluation.',
          { severity: 'error', pointer: '/authorityResource' },
        ),
      );
    }
    if (authorityContextComplete && options.manifest !== undefined && options.finalUrl) {
      authority = evaluateAuthority(options.manifest, authorityResource, options.finalUrl, {
        now,
        ...(signatureValid && keyId ? { verifiedKeyId: keyId } : {}),
        observedRootUrl: options.observedRootUrl,
        requireObservedRoot: true,
      });
      findings.push(...authority.findings);
    }
    if (authorityResource === undefined && authorityContextRequested) {
      authorityDescriptorValid = false;
      findings.push(
        finding(
          'EOM_AUTHORITY_DESCRIPTOR_REQUIRED',
          'security',
          'Authority-aware signature verification requires the manifest resource descriptor that was fetched.',
          { severity: 'error', pointer: '/authorityResource' },
        ),
      );
    }
  }
  const delegationScopeValid =
    authority?.accepted ?? (authorityContextRequested ? false : 'not-evaluated');
  const rootAuthorityStatus = authority
    ? authority.accepted
      ? 'accepted'
      : 'rejected'
    : authorityContextRequested
      ? 'rejected'
      : 'not-evaluated';
  const overall =
    canonicalizationValid &&
    digestMatch &&
    headerValid &&
    keyTemporalValid &&
    keySetExpiryValid &&
    keyScopeValid &&
    !keyRevoked &&
    signatureValid &&
    subjectMatch &&
    resourceExpiryValid &&
    signatureExpiryValid &&
    authorityContextValid &&
    authorityDescriptorValid &&
    evaluationTimeValid &&
    (authority === undefined || authority.accepted);
  const verifiedOverall = overall && keySetValid && manifestKeySetBindingValid && keyRecordValid;
  return {
    canonicalizationValid,
    digestMatch,
    signatureValid,
    keyTemporalValid,
    keyRevoked,
    keySetExpiryValid,
    keyScopeValid,
    delegationScopeValid,
    rootAuthorityStatus,
    resourceExpiryValid,
    signatureExpiryValid,
    subjectMatch,
    unsigned: false,
    overall: verifiedOverall,
    findings: uniqueFindings(findings),
    ...(authority ? { authority } : {}),
  };
}

/** Unsigned conformant v1 resources remain valid; this is separate from signature verification. */
export function verifyUnsigned(
  value: unknown,
  options: { readonly now?: Date } = {},
): UnsignedVerificationResult {
  const candidateNow = options.now ?? new Date();
  const evaluationTimeValid = isValidDate(candidateNow);
  const now = evaluationTimeValid ? candidateNow : new Date(0);
  const findings: Finding[] = [];
  if (!evaluationTimeValid) {
    findings.push(
      finding(
        'EOM_SIGNATURE_TIME_INVALID',
        'security',
        'Unsigned verification requires a valid evaluation time.',
        { severity: 'error' },
      ),
    );
  }
  let canonicalizationValid = true;
  try {
    canonicalizeJson(value);
  } catch (error) {
    canonicalizationValid = false;
    findings.push(
      finding(
        'EOM_SIGNATURE_CANONICALIZATION_FAILED',
        'integrity',
        error instanceof Error ? error.message : 'Canonicalization failed.',
        { severity: 'error' },
      ),
    );
  }
  const resourceExpiryValid = isResourceCurrent(value, now);
  if (!resourceExpiryValid)
    findings.push(
      finding(
        'EOM_SIGNATURE_RESOURCE_EXPIRED',
        'freshness',
        'The unsigned resource is past its declared expiry.',
        { severity: 'warning' },
      ),
    );
  return {
    canonicalizationValid,
    digestMatch: 'not-applicable',
    signatureValid: 'not-applicable',
    keyTemporalValid: 'not-applicable',
    keyRevoked: false,
    keyScopeValid: 'not-evaluated',
    delegationScopeValid: 'not-evaluated',
    rootAuthorityStatus: 'not-evaluated',
    resourceExpiryValid,
    subjectMatch: 'not-applicable',
    unsigned: true,
    overall: canonicalizationValid && evaluationTimeValid,
    findings,
  };
}

export class SignaturePolicyError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SignaturePolicyError';
  }
}

function decodeProtectedHeader(
  value: string | undefined,
  findings: Finding[],
): Record<string, unknown> | undefined {
  if (!value) {
    findings.push(
      finding(
        'EOM_SIGNATURE_PROTECTED_REQUIRED',
        'integrity',
        'A detached signature must include a protected header.',
        { severity: 'error' },
      ),
    );
    return undefined;
  }
  try {
    const decoded = parseStrictJson(
      decodeUtf8(decodeBase64Url(value), 'signature protected header'),
      'signature protected header',
    );
    if (!isJsonObject(decoded)) throw new Error('Protected header must be a JSON object.');
    return decoded;
  } catch (error) {
    findings.push(
      finding(
        'EOM_SIGNATURE_PROTECTED_INVALID',
        'integrity',
        error instanceof Error ? error.message : 'Protected header is invalid.',
        { severity: 'error' },
      ),
    );
    return undefined;
  }
}

function validateProtectedHeader(
  header: Record<string, unknown>,
  keyId: string | undefined,
  signature: unknown,
  findings: Finding[],
): boolean {
  let valid = true;
  if (valueAt(header, ['alg']) !== 'EdDSA') {
    findings.push(
      finding(
        'EOM_SIGNATURE_ALGORITHM_UNSUPPORTED',
        'security',
        'Only EdDSA with Ed25519 is allowed by the stable v1 profile.',
        { severity: 'error' },
      ),
    );
    valid = false;
  }
  const critical = arrayAt(header, ['crit']);
  const metadataCandidate = valueAt(header, ['eom']);
  if (
    valueAt(header, ['b64']) !== false ||
    !Array.isArray(valueAt(header, ['crit'])) ||
    new Set(critical).size !== critical.length ||
    critical.length !== 2 ||
    !critical.includes('b64') ||
    !critical.includes('eom') ||
    !isJsonObject(metadataCandidate) ||
    valueAt(metadataCandidate, ['version']) !== '1.0' ||
    valueAt(metadataCandidate, ['canonicalization']) !== 'RFC8785-JCS'
  ) {
    findings.push(
      finding(
        'EOM_SIGNATURE_PROFILE_INVALID',
        'integrity',
        'The protected header does not declare the EOM detached RFC 8785 profile.',
        { severity: 'error' },
      ),
    );
    valid = false;
  }
  const metadata = isJsonObject(metadataCandidate) ? metadataCandidate : undefined;
  if (
    metadata &&
    Object.keys(metadata).some(
      (key) => !['version', 'canonicalization', 'createdAt', 'expires'].includes(key),
    )
  ) {
    findings.push(
      finding(
        'EOM_SIGNATURE_PROFILE_INVALID',
        'integrity',
        'The protected EOM lifetime object contains an unknown property.',
        { severity: 'error', pointer: '/protected/eom' },
      ),
    );
    valid = false;
  }
  const sidecarCreatedAt = stringAt(signature, ['createdAt']);
  const sidecarExpiresPresent = isJsonObject(signature) && Object.hasOwn(signature, 'expires');
  const sidecarExpires = sidecarExpiresPresent ? stringAt(signature, ['expires']) : undefined;
  const metadataExpiresPresent = metadata !== undefined && Object.hasOwn(metadata, 'expires');
  const metadataCreatedAt = stringAt(metadata, ['createdAt']);
  if (
    metadata === undefined ||
    metadataCreatedAt === undefined ||
    metadataCreatedAt !== sidecarCreatedAt ||
    metadataExpiresPresent !== sidecarExpiresPresent ||
    (metadataExpiresPresent && valueAt(metadata, ['expires']) !== sidecarExpires)
  ) {
    findings.push(
      finding(
        'EOM_SIGNATURE_LIFETIME_BINDING',
        'integrity',
        'Protected signature lifetime metadata must exactly match the sidecar record.',
        { severity: 'error', pointer: '/createdAt' },
      ),
    );
    valid = false;
  }
  const contentType = stringAt(signature, ['contentType']);
  const sidecarAlgorithm = stringAt(signature, ['algorithm']);
  const sidecarCanonicalization = stringAt(signature, ['canonicalization']);
  const sidecarKeyId = stringAt(signature, ['keyId']);
  if (valueAt(header, ['cty']) !== contentType) {
    findings.push(
      finding(
        'EOM_SIGNATURE_CONTENT_TYPE_BINDING',
        'integrity',
        'The protected content type must exactly match the sidecar record.',
        { severity: 'error', pointer: '/contentType' },
      ),
    );
    valid = false;
  }
  if (valueAt(header, ['alg']) !== sidecarAlgorithm) {
    findings.push(
      finding(
        'EOM_SIGNATURE_ALGORITHM_BINDING',
        'integrity',
        'The protected algorithm must exactly match the sidecar record.',
        { severity: 'error', pointer: '/algorithm' },
      ),
    );
    valid = false;
  }
  if (metadata && valueAt(metadata, ['canonicalization']) !== sidecarCanonicalization) {
    findings.push(
      finding(
        'EOM_SIGNATURE_CANONICALIZATION_BINDING',
        'integrity',
        'The protected canonicalization must exactly match the sidecar record.',
        { severity: 'error', pointer: '/canonicalization' },
      ),
    );
    valid = false;
  }
  if (Array.isArray(valueAt(header, ['crit']))) {
    for (const item of critical) {
      if (item !== 'b64' && item !== 'eom') {
        findings.push(
          finding(
            'EOM_SIGNATURE_UNKNOWN_CRITICAL',
            'security',
            'The signature contains an unknown critical header.',
            { severity: 'error' },
          ),
        );
        valid = false;
      }
    }
  }
  if (
    typeof valueAt(header, ['kid']) !== 'string' ||
    valueAt(header, ['kid']) !== keyId ||
    valueAt(header, ['kid']) !== sidecarKeyId
  ) {
    findings.push(
      finding(
        'EOM_SIGNATURE_KEY_BINDING',
        'security',
        'Protected key id and signature key id do not match.',
        { severity: 'error' },
      ),
    );
    valid = false;
  }
  return valid;
}

function validateSignatureRecord(
  signature: unknown,
  protectedValue: string | undefined,
  signatureValue: string | undefined,
  findings: Finding[],
): boolean {
  let valid = true;
  if (isJsonObject(signature)) {
    const allowedFields = new Set([
      '$schema',
      'specification',
      'version',
      'id',
      'type',
      'canonical',
      'subject',
      'keyId',
      'algorithm',
      'canonicalization',
      'payloadDigest',
      'protected',
      'signature',
      'compact',
      'detached',
      'createdAt',
      'expires',
      'contentType',
      'provenance',
      'extensions',
    ]);
    for (const field of Object.keys(signature)) {
      if (allowedFields.has(field)) continue;
      findings.push(
        finding(
          'EOM_SIGNATURE_PROFILE_INVALID',
          'integrity',
          `The signature contains unsupported property ${field}.`,
          { severity: 'error', pointer: `/${escapeJsonPointer(field)}` },
        ),
      );
      valid = false;
    }
  }
  const requiredStrings: readonly [string, string][] = [
    ['$schema', SIGNATURE_SCHEMA],
    ['specification', SPECIFICATION],
    ['version', '1.0'],
    ['type', 'signature'],
    ['algorithm', 'EdDSA'],
    ['canonicalization', 'RFC8785-JCS'],
    ['contentType', 'application/json'],
  ];
  for (const [field, expected] of requiredStrings) {
    if (stringAt(signature, [field]) !== expected) {
      findings.push(
        finding(
          'EOM_SIGNATURE_PROFILE_INVALID',
          'integrity',
          `The signature field ${field} must equal ${expected}.`,
          { severity: 'error', pointer: `/${escapeJsonPointer(field)}` },
        ),
      );
      valid = false;
    }
  }
  if (valueAt(signature, ['detached']) !== true) {
    findings.push(
      finding(
        'EOM_SIGNATURE_PROFILE_INVALID',
        'integrity',
        'The signature record must be detached.',
        { severity: 'error', pointer: '/detached' },
      ),
    );
    valid = false;
  }
  for (const field of ['id', 'subject', 'keyId'] as const) {
    const value = stringAt(signature, [field]);
    if (!value || !isAbsoluteHttpsOrUri(value)) {
      findings.push(
        finding(
          'EOM_SIGNATURE_PROFILE_INVALID',
          'integrity',
          `The signature ${field} must be an absolute URI.`,
          { severity: 'error', pointer: `/${field}` },
        ),
      );
      valid = false;
    }
  }
  const canonical = stringAt(signature, ['canonical']);
  if (!canonical || !isHttpsUri(canonical)) {
    findings.push(
      finding(
        'EOM_SIGNATURE_PROFILE_INVALID',
        'integrity',
        'The signature canonical value must be an HTTPS URL.',
        { severity: 'error', pointer: '/canonical' },
      ),
    );
    valid = false;
  }
  const createdAt = stringAt(signature, ['createdAt']);
  if (!createdAt || !isDateTime(createdAt)) {
    findings.push(
      finding(
        'EOM_SIGNATURE_PROFILE_INVALID',
        'integrity',
        'The signature creation time must be a valid date-time.',
        { severity: 'error', pointer: '/createdAt' },
      ),
    );
    valid = false;
  }
  const hasExpires = isJsonObject(signature) && Object.hasOwn(signature, 'expires');
  const expires = stringAt(signature, ['expires']);
  if (hasExpires && (expires === undefined || !isDateTime(expires))) {
    findings.push(
      finding(
        'EOM_SIGNATURE_PROFILE_INVALID',
        'integrity',
        'The signature expiry time must be a valid date-time.',
        { severity: 'error', pointer: '/expires' },
      ),
    );
    valid = false;
  }
  if (
    createdAt !== undefined &&
    expires !== undefined &&
    isDateTime(createdAt) &&
    isDateTime(expires) &&
    Date.parse(createdAt) >= Date.parse(expires)
  ) {
    findings.push(
      finding(
        'EOM_SIGNATURE_TIME_INVALID',
        'freshness',
        'The signature expiry time must be later than its creation time.',
        { severity: 'error', pointer: '/expires' },
      ),
    );
    valid = false;
  }
  const contentType = stringAt(signature, ['contentType']);
  if (contentType !== undefined && contentType !== 'application/json') {
    findings.push(
      finding(
        'EOM_SIGNATURE_PROFILE_INVALID',
        'integrity',
        'The signature content type must be application/json.',
        { severity: 'error', pointer: '/contentType' },
      ),
    );
    valid = false;
  }
  const payloadDigest = stringAt(signature, ['payloadDigest']);
  if (!payloadDigest || !/^sha-256=:[A-Za-z0-9+/]+={0,2}:$/u.test(payloadDigest)) {
    findings.push(
      finding(
        'EOM_SIGNATURE_PROFILE_INVALID',
        'integrity',
        'The signature payload digest is not a valid SHA-256 digest record.',
        { severity: 'error', pointer: '/payloadDigest' },
      ),
    );
    valid = false;
  }
  const compact = stringAt(signature, ['compact']);
  if (
    protectedValue === undefined ||
    signatureValue === undefined ||
    compact !== `${protectedValue}..${signatureValue}`
  ) {
    findings.push(
      finding(
        'EOM_SIGNATURE_COMPACT_MISMATCH',
        'integrity',
        'The compact detached representation does not match its record fields.',
        { severity: 'error' },
      ),
    );
    valid = false;
  }
  return valid;
}

function findKey(keySet: unknown, keyId: string): unknown {
  const keys = arrayAt(keySet, ['keys']);
  return keys.find((key) => stringAt(key, ['kid']) === keyId);
}

function validateManifestKeySetBinding(
  manifest: unknown,
  keySet: unknown,
  findings: Finding[],
): boolean {
  if (manifest === undefined) return true;
  const signing = valueAt(manifest, ['signing']);
  if (signing === undefined) return true;
  if (!isJsonObject(signing)) {
    findings.push(
      finding(
        'EOM_SIGNATURE_MANIFEST_KEY_SET_INVALID',
        'security',
        'A manifest signing declaration must be an object before its key-set binding can be verified.',
        { severity: 'error', pointer: '/signing' },
      ),
    );
    return false;
  }
  const declaredKeySet = stringAt(signing, ['keySet']);
  const suppliedKeySet = stringAt(keySet, ['id']);
  if (declaredKeySet === undefined || !isAbsoluteHttpsOrUri(declaredKeySet)) {
    findings.push(
      finding(
        'EOM_SIGNATURE_MANIFEST_KEY_SET_REQUIRED',
        'security',
        'A manifest signing declaration must identify its key set.',
        { severity: 'error', pointer: '/signing/keySet' },
      ),
    );
    return false;
  }
  if (
    suppliedKeySet === undefined ||
    !isAbsoluteHttpsOrUri(suppliedKeySet) ||
    suppliedKeySet !== declaredKeySet
  ) {
    findings.push(
      finding(
        'EOM_SIGNATURE_MANIFEST_KEY_SET_MISMATCH',
        'security',
        'The supplied verification key set does not match the key-set identifier declared by the manifest.',
        {
          severity: 'error',
          pointer: '/signing/keySet',
          related: [declaredKeySet, ...(suppliedKeySet === undefined ? [] : [suppliedKeySet])],
        },
      ),
    );
    return false;
  }
  return true;
}

function evaluateKeyScope(record: unknown, resource: unknown, findings: Finding[]): boolean {
  if (!isJsonObject(record)) return false;
  const scope = valueAt(record, ['scope']);
  if (scope === undefined) return true;
  if (!keyScopeShapeIsValid(scope)) return false;
  const resourceType = stringAt(resource, ['type']);
  const resourceId = stringAt(resource, ['id']);
  const resourceTypes = arrayAt(scope, ['resourceTypes']).filter(
    (item): item is string => typeof item === 'string',
  );
  const resourceIds = arrayAt(scope, ['resourceIds']).filter(
    (item): item is string => typeof item === 'string',
  );
  const typeInScope =
    resourceTypes.length === 0 ||
    (resourceType !== undefined && resourceTypes.includes(resourceType));
  const idInScope =
    resourceIds.length === 0 || (resourceId !== undefined && resourceIds.includes(resourceId));
  if (!typeInScope || !idInScope) {
    findings.push(
      finding(
        'EOM_SIGNATURE_KEY_OUT_OF_SCOPE',
        'security',
        'The signing key is not authorized for this resource type or resource identifier.',
        { severity: 'error', pointer: '/keys/scope' },
      ),
    );
  }
  return typeInScope && idInScope;
}

function keyScopeShapeIsValid(value: unknown): boolean {
  if (!isJsonObject(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => !['resourceTypes', 'resourceIds'].includes(key)))
    return false;
  const resourceTypes = valueAt(value, ['resourceTypes']);
  const resourceIds = valueAt(value, ['resourceIds']);
  if (Object.hasOwn(value, 'resourceTypes')) {
    if (!Array.isArray(resourceTypes) || resourceTypes.length === 0) return false;
    if (
      !resourceTypes.every((item) => typeof item === 'string' && item.length > 0) ||
      new Set(resourceTypes).size !== resourceTypes.length
    )
      return false;
  }
  if (Object.hasOwn(value, 'resourceIds')) {
    if (!Array.isArray(resourceIds) || resourceIds.length === 0) return false;
    if (
      !resourceIds.every((item) => typeof item === 'string' && isAbsoluteHttpsOrUri(item)) ||
      new Set(resourceIds).size !== resourceIds.length
    )
      return false;
  }
  return true;
}

function validateKeySet(keySet: unknown, findings: Finding[]): boolean {
  let valid = true;
  if (!isJsonObject(keySet)) {
    findings.push(
      finding(
        'EOM_SIGNATURE_KEY_SET_INVALID',
        'integrity',
        'The verification key set must be a JSON object.',
        { severity: 'error' },
      ),
    );
    return false;
  }
  // The public API historically accepted a `{ keys: [...] }` verification
  // fragment. Preserve that input shape while enforcing the complete schema
  // whenever a caller supplies any key-set identity metadata.
  const hasProfileMetadata = Object.keys(keySet).some((field) => field !== 'keys');
  if (hasProfileMetadata) {
    const requiredStrings: readonly [string, string][] = [
      ['$schema', KEY_SET_SCHEMA],
      ['specification', SPECIFICATION],
      ['version', '1.0'],
      ['type', 'key-set'],
    ];
    for (const [field, expected] of requiredStrings) {
      if (stringAt(keySet, [field]) === expected) continue;
      findings.push(
        finding(
          'EOM_SIGNATURE_KEY_SET_INVALID',
          'integrity',
          `The verification key set field ${field} must equal ${expected}.`,
          { severity: 'error', pointer: `/${escapeJsonPointer(field)}` },
        ),
      );
      valid = false;
    }
    for (const field of ['id', 'canonical'] as const) {
      const value = stringAt(keySet, [field]);
      const accepted =
        field === 'canonical'
          ? value !== undefined && isHttpsUri(value)
          : value !== undefined && isAbsoluteHttpsOrUri(value);
      if (accepted) continue;
      findings.push(
        finding(
          'EOM_SIGNATURE_KEY_SET_INVALID',
          'integrity',
          `The verification key set ${field} must be an absolute ${field === 'canonical' ? 'HTTPS ' : ''}URI.`,
          { severity: 'error', pointer: `/${field}` },
        ),
      );
      valid = false;
    }
    const allowedFields = new Set([
      '$schema',
      'specification',
      'version',
      'id',
      'type',
      'canonical',
      'keys',
      'modified',
      'expires',
      'provenance',
      'extensions',
    ]);
    for (const field of Object.keys(keySet)) {
      if (allowedFields.has(field)) continue;
      findings.push(
        finding(
          'EOM_SIGNATURE_KEY_SET_INVALID',
          'integrity',
          `The verification key set contains unsupported property ${field}.`,
          { severity: 'error', pointer: `/${escapeJsonPointer(field)}` },
        ),
      );
      valid = false;
    }
    for (const field of ['modified', 'expires'] as const) {
      const value = stringAt(keySet, [field]);
      if (!Object.hasOwn(keySet, field) || (value !== undefined && isDateTime(value))) continue;
      findings.push(
        finding(
          'EOM_SIGNATURE_KEY_SET_INVALID',
          'integrity',
          `The verification key set ${field} value is not a valid date-time.`,
          { severity: 'error', pointer: `/${field}` },
        ),
      );
      valid = false;
    }
  }
  const rawKeys = valueAt(keySet, ['keys']);
  if (!Array.isArray(rawKeys)) {
    findings.push(
      finding(
        'EOM_SIGNATURE_KEY_SET_INVALID',
        'integrity',
        'The verification key set must contain a keys array.',
        { severity: 'error', pointer: '/keys' },
      ),
    );
    return false;
  }
  const seen = new Set<string>();
  for (const [index, key] of rawKeys.entries()) {
    const keyId = stringAt(key, ['kid']);
    if (!keyId) {
      findings.push(
        finding(
          'EOM_SIGNATURE_KEY_SET_INVALID',
          'integrity',
          'Every verification key must have a key identifier.',
          { severity: 'error', pointer: `/keys/${index}/kid` },
        ),
      );
      valid = false;
      continue;
    }
    if (seen.has(keyId)) {
      findings.push(
        finding(
          'EOM_SIGNATURE_KEY_DUPLICATE_ID',
          'integrity',
          'A verification key set must not contain duplicate key identifiers.',
          { severity: 'error', pointer: `/keys/${index}/kid`, related: [keyId] },
        ),
      );
      valid = false;
    }
    seen.add(keyId);
    if (!validateKeyRecord(key, findings)) valid = false;
  }
  return valid;
}

function validateKeyRecord(record: unknown, findings: Finding[]): boolean {
  let valid = true;
  if (!isJsonObject(record)) {
    findings.push(
      finding(
        'EOM_SIGNATURE_KEY_SET_INVALID',
        'integrity',
        'A verification key must be a JSON object.',
        { severity: 'error' },
      ),
    );
    return false;
  }
  const allowedFields = new Set([
    'kid',
    'kty',
    'use',
    'alg',
    'purpose',
    'owner',
    'scope',
    'status',
    'publicKeyJwk',
    'validFrom',
    'validUntil',
    'revokedAt',
    'successor',
    'provenance',
  ]);
  for (const field of Object.keys(record)) {
    if (allowedFields.has(field)) continue;
    findings.push(
      finding(
        'EOM_SIGNATURE_KEY_SET_INVALID',
        'integrity',
        `A verification key contains unsupported property ${field}.`,
        { severity: 'error', pointer: `/keys/${escapeJsonPointer(field)}` },
      ),
    );
    valid = false;
  }
  const requiredValues: readonly [string, unknown][] = [
    ['kty', 'OKP'],
    ['use', 'sig'],
    ['alg', 'EdDSA'],
  ];
  for (const [field, expected] of requiredValues) {
    if (valueAt(record, [field]) === expected) continue;
    findings.push(
      finding(
        'EOM_SIGNATURE_KEY_SET_INVALID',
        'integrity',
        `A verification key field ${field} must equal ${String(expected)}.`,
        { severity: 'error', pointer: `/keys/${field}` },
      ),
    );
    valid = false;
  }
  const keyId = stringAt(record, ['kid']);
  if (!keyId || !isAbsoluteHttpsOrUri(keyId)) {
    findings.push(
      finding(
        'EOM_SIGNATURE_KEY_SET_INVALID',
        'integrity',
        'A verification key kid must be an absolute URI.',
        { severity: 'error', pointer: '/keys/kid' },
      ),
    );
    valid = false;
  }
  const publicJwk = valueAt(record, ['publicKeyJwk']);
  if (
    !isJsonObject(publicJwk) ||
    valueAt(publicJwk, ['kty']) !== 'OKP' ||
    valueAt(publicJwk, ['crv']) !== 'Ed25519' ||
    typeof valueAt(publicJwk, ['x']) !== 'string' ||
    !/^[A-Za-z0-9_-]+$/u.test(stringAt(publicJwk, ['x']) ?? '') ||
    Object.keys(publicJwk).some((field) => !['kty', 'crv', 'x'].includes(field))
  ) {
    findings.push(
      finding(
        'EOM_SIGNATURE_KEY_SET_INVALID',
        'integrity',
        'A verification key must contain only a public Ed25519 JWK.',
        { severity: 'error', pointer: '/keys/publicKeyJwk' },
      ),
    );
    valid = false;
  }
  if (Object.hasOwn(record, 'scope') && !keyScopeShapeIsValid(valueAt(record, ['scope']))) {
    findings.push(
      finding(
        'EOM_SIGNATURE_KEY_SCOPE_INVALID',
        'security',
        'A signing key scope must contain one or more unique resource types or identifiers.',
        { severity: 'error', pointer: '/keys/scope' },
      ),
    );
    valid = false;
  }
  const status = stringAt(record, ['status']);
  if (status !== 'active' && status !== 'revoked' && status !== 'expired') {
    findings.push(
      finding(
        'EOM_SIGNATURE_KEY_SET_INVALID',
        'integrity',
        'A verification key must declare a recognized lifecycle status.',
        { severity: 'error', pointer: '/keys/status' },
      ),
    );
    valid = false;
  }
  const validFrom = stringAt(record, ['validFrom']);
  const validUntil = stringAt(record, ['validUntil']);
  const revokedAt = stringAt(record, ['revokedAt']);
  for (const [field, value] of [
    ['validFrom', validFrom],
    ['validUntil', validUntil],
    ['revokedAt', revokedAt],
  ] as const) {
    if (Object.hasOwn(record, field) && (value === undefined || !isDateTime(value))) {
      findings.push(
        finding(
          'EOM_SIGNATURE_KEY_SET_INVALID',
          'integrity',
          `The verification key ${field} value is not a valid date-time.`,
          { severity: 'error', pointer: `/keys/${field}` },
        ),
      );
      valid = false;
    }
  }
  if (
    validFrom !== undefined &&
    validUntil !== undefined &&
    isDateTime(validFrom) &&
    isDateTime(validUntil) &&
    Date.parse(validFrom) >= Date.parse(validUntil)
  ) {
    findings.push(
      finding(
        'EOM_SIGNATURE_KEY_SET_INVALID',
        'integrity',
        'A verification key validFrom must be earlier than validUntil.',
        { severity: 'error', pointer: '/keys/validUntil' },
      ),
    );
    valid = false;
  }
  return valid;
}

function publicKeyFromRecord(record: unknown): KeyObject {
  const jwk = valueAt(record, ['publicKeyJwk']);
  if (
    !isJsonObject(jwk) ||
    valueAt(jwk, ['kty']) !== 'OKP' ||
    valueAt(jwk, ['crv']) !== 'Ed25519' ||
    typeof valueAt(jwk, ['x']) !== 'string'
  ) {
    throw new SignaturePolicyError(
      'EOM_SIGNATURE_KEY_ALGORITHM',
      'The key set does not contain an allowed Ed25519 public key.',
    );
  }
  if ('d' in jwk)
    throw new SignaturePolicyError(
      'EOM_SIGNATURE_PRIVATE_KEY',
      'Private key material is not accepted in a public key set.',
    );
  if (stringAt(record, ['alg']) !== undefined && stringAt(record, ['alg']) !== 'EdDSA') {
    throw new SignaturePolicyError(
      'EOM_SIGNATURE_KEY_ALGORITHM',
      'The key set entry does not allow EdDSA verification.',
    );
  }
  return createPublicKey({ key: jwk as unknown as NodeJsonWebKey, format: 'jwk' });
}

function normalizePrivateKey(value: KeyObject | string | Uint8Array): KeyObject | string | Buffer {
  return value instanceof Uint8Array && !(value instanceof Buffer) ? Buffer.from(value) : value;
}

function isWithinKeyPeriod(record: unknown, now: Date): boolean {
  const validFromPresent = isJsonObject(record) && Object.hasOwn(record, 'validFrom');
  const validUntilPresent = isJsonObject(record) && Object.hasOwn(record, 'validUntil');
  const validFrom = stringAt(record, ['validFrom']);
  const validUntil = stringAt(record, ['validUntil']);
  const from = !validFromPresent
    ? undefined
    : validFrom !== undefined && isDateTime(validFrom)
      ? Date.parse(validFrom)
      : Number.NaN;
  const until = !validUntilPresent
    ? undefined
    : validUntil !== undefined && isDateTime(validUntil)
      ? Date.parse(validUntil)
      : Number.NaN;
  return (
    (from === undefined || (!Number.isNaN(from) && from <= now.getTime())) &&
    (until === undefined || (!Number.isNaN(until) && until >= now.getTime()))
  );
}

function isDateTime(value: string): boolean {
  return parseDateTime(value) !== undefined;
}

function isPast(value: unknown, path: readonly string[], now: Date): boolean {
  const date = stringAt(value, path);
  return date !== undefined && Date.parse(date) <= now.getTime();
}

function isResourceCurrent(value: unknown, now: Date): boolean {
  const expiresPresent = isJsonObject(value) && Object.hasOwn(value, 'expires');
  const rawExpires = valueAt(value, ['expires']);
  if (!expiresPresent) return true;
  return (
    typeof rawExpires === 'string' &&
    isDateTime(rawExpires) &&
    Date.parse(rawExpires) >= now.getTime()
  );
}

function digestBytes(value: Uint8Array): string {
  return `sha-256=:${createHash('sha256').update(value).digest('base64')}:`;
}

function encodeBase64Url(value: Uint8Array): string {
  return Buffer.from(value)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function decodeBase64Url(value: string): Buffer {
  if (!value || !/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1)
    throw new SignaturePolicyError(
      'EOM_SIGNATURE_BASE64_INVALID',
      'Signature encoding is not valid base64url.',
    );
  const padded =
    value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const decoded = Buffer.from(padded, 'base64');
  if (encodeBase64Url(decoded) !== value)
    throw new SignaturePolicyError(
      'EOM_SIGNATURE_BASE64_INVALID',
      'Signature encoding is not canonical base64url.',
    );
  return decoded;
}

function decodeUtf8(value: Uint8Array, source: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(value);
  } catch (error) {
    throw new SignaturePolicyError(
      'EOM_SIGNATURE_UTF8_INVALID',
      `The ${source} is not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

interface JsonValidationState {
  readonly visited: WeakSet<object>;
  nodes: number;
}

function canonicalValue(
  value: JsonValue,
  depth = 0,
  visited = new WeakSet<object>(),
  state: JsonValidationState = { visited, nodes: 0 },
): string {
  state.nodes += 1;
  if (state.nodes > MAX_SIGNATURE_JSON_NODES) {
    throw new SignaturePolicyError(
      'EOM_CANONICALIZATION_SIZE',
      `JSON value exceeds the ${MAX_SIGNATURE_JSON_NODES}-node safety limit.`,
    );
  }
  if (depth > MAX_SIGNATURE_JSON_DEPTH) {
    throw new SignaturePolicyError(
      'EOM_CANONICALIZATION_DEPTH',
      `JSON nesting exceeds the ${MAX_SIGNATURE_JSON_DEPTH}-level safety limit.`,
    );
  }
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    assertWellFormedUnicode(value);
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new SignaturePolicyError(
        'EOM_CANONICALIZATION_NUMBER',
        'Non-finite numbers are not valid JCS values.',
      );
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    assertDenseArray(value);
    assertAcyclic(value, visited);
    try {
      return `[${value.map((item) => canonicalValue(item, depth + 1, visited, state)).join(',')}]`;
    } finally {
      visited.delete(value);
    }
  }
  assertAcyclic(value, visited);
  try {
    const entries = Object.keys(value).sort(jcsKeyCompare);
    return `{${entries
      .map((key) => {
        assertWellFormedUnicode(key);
        return `${JSON.stringify(key)}:${canonicalValue(value[key] as JsonValue, depth + 1, visited, state)}`;
      })
      .join(',')}}`;
  } finally {
    visited.delete(value);
  }
}

function assertAcyclic(value: object, visited: WeakSet<object>): void {
  if (visited.has(value)) {
    throw new SignaturePolicyError(
      'EOM_CANONICALIZATION_CYCLE',
      'Cyclic values are not valid JSON canonicalization input.',
    );
  }
  visited.add(value);
}

function jcsKeyCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isJsonValue(
  value: unknown,
  depth = 0,
  visited = new WeakSet<object>(),
  state: JsonValidationState = { visited, nodes: 0 },
): value is JsonValue {
  state.nodes += 1;
  if (state.nodes > MAX_SIGNATURE_JSON_NODES) {
    throw new SignaturePolicyError(
      'EOM_CANONICALIZATION_SIZE',
      `JSON value exceeds the ${MAX_SIGNATURE_JSON_NODES}-node safety limit.`,
    );
  }
  if (depth > MAX_SIGNATURE_JSON_DEPTH)
    throw new SignaturePolicyError(
      'EOM_CANONICALIZATION_DEPTH',
      `JSON nesting exceeds the ${MAX_SIGNATURE_JSON_DEPTH}-level safety limit.`,
    );
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) {
    assertDenseArray(value);
    if (visited.has(value)) return false;
    visited.add(value);
    try {
      for (let index = 0; index < value.length; index += 1) {
        if (!isJsonValue(value[index], depth + 1, visited, state)) return false;
      }
      return true;
    } finally {
      visited.delete(value);
    }
  }
  if (isJsonObject(value)) {
    if (visited.has(value)) return false;
    visited.add(value);
    try {
      for (const item of Object.values(value)) {
        if (!isJsonValue(item, depth + 1, visited, state)) return false;
      }
      return true;
    } finally {
      visited.delete(value);
    }
  }
  return false;
}

function assertDenseArray(value: readonly unknown[]): void {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      throw new SignaturePolicyError(
        'EOM_CANONICALIZATION_VALUE',
        'Sparse arrays are not valid JSON canonicalization input.',
      );
    }
  }
}

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        index += 1;
        continue;
      }
      return false;
    }
    if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function assertWellFormedUnicode(value: string): void {
  if (!isWellFormedUnicode(value))
    throw new SignaturePolicyError(
      'EOM_CANONICALIZATION_UNICODE',
      'Unpaired UTF-16 surrogates are not valid JCS text.',
    );
}

function isHttpsUri(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function escapeJsonPointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function stringAt(value: unknown, path: readonly string[]): string | undefined {
  const candidate = valueAt(value, path);
  return typeof candidate === 'string' ? candidate : undefined;
}

function valueAt(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (!isJsonObject(current) || !Object.hasOwn(current, segment)) return undefined;
    current = current[segment];
  }
  return current;
}

function arrayAt(value: unknown, path: readonly string[]): readonly unknown[] {
  const candidate = valueAt(value, path);
  return Array.isArray(candidate) ? candidate : [];
}

function asJsonObject(value: Record<string, unknown>): JsonObject {
  const result: JsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    if (!isJsonValue(child))
      throw new SignaturePolicyError(
        'EOM_SIGNATURE_JSON_VALUE',
        'Key metadata must be JSON-compatible.',
      );
    result[key] = child;
  }
  return result;
}

function isAbsoluteHttpsOrUri(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol.length > 1 && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function toIso(value: Date | string): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime()))
      throw new SignaturePolicyError(
        'EOM_SIGNATURE_TIME_INVALID',
        'Signature creation time is invalid.',
      );
    return value.toISOString();
  }
  const timestamp = parseDateTime(value);
  if (timestamp === undefined)
    throw new SignaturePolicyError(
      'EOM_SIGNATURE_TIME_INVALID',
      'Signature creation time is invalid.',
    );
  return new Date(timestamp).toISOString();
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
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
