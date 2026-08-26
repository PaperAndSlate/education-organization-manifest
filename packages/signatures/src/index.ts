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
import { evaluateAuthority, type AuthorityResult } from '@paperandslate/eom-authority';
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
}

export interface VerificationOptions {
  readonly now?: Date;
  readonly manifest?: unknown;
  readonly resource?: unknown;
  readonly finalUrl?: string;
}

export interface SignatureVerificationResult {
  readonly canonicalizationValid: boolean;
  readonly digestMatch: boolean;
  readonly signatureValid: boolean;
  readonly keyTemporalValid: boolean;
  readonly keyRevoked: boolean;
  readonly keySetExpiryValid: boolean;
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

/** Canonicalize JSON using the EOM RFC 8785 JCS profile. */
export function canonicalizeJson(value: unknown): string {
  if (!isJsonValue(value))
    throw new SignaturePolicyError(
      'EOM_CANONICALIZATION_VALUE',
      'Only finite JSON values can be canonicalized.',
    );
  return canonicalValue(value);
}

export function canonicalizeJsonText(text: string, source = 'JSON input'): string {
  return canonicalizeJson(parseStrictJson(text, source));
}

export function contentDigest(value: unknown): string {
  return digestBytes(Buffer.from(canonicalizeJson(value), 'utf8'));
}

export function signDetached(value: unknown, options: SignOptions): DetachedSignatureRecord {
  const subject = options.subject ?? stringAt(value, ['id']);
  if (!subject || !isAbsoluteHttpsOrUri(subject)) {
    throw new SignaturePolicyError(
      'EOM_SIGNATURE_SUBJECT_REQUIRED',
      'A signed resource must have an absolute subject id.',
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
  const now = options.now ?? new Date();
  const findings: Finding[] = [];
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
  const keyRecordValid = keyRecord === undefined || validateKeyRecord(keyRecord, findings);
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
  const hasAuthorityInputs =
    options.manifest !== undefined &&
    options.resource !== undefined &&
    options.finalUrl !== undefined;
  if (hasAuthorityInputs) {
    authority = evaluateAuthority(options.manifest, options.resource, options.finalUrl, {
      now,
      ...(signatureValid && keyId ? { verifiedKeyId: keyId } : {}),
    });
    findings.push(...authority.findings);
  }
  const delegationScopeValid = authority?.accepted ?? 'not-evaluated';
  const rootAuthorityStatus = authority
    ? authority.accepted
      ? 'accepted'
      : 'rejected'
    : 'not-evaluated';
  const overall =
    canonicalizationValid &&
    digestMatch &&
    headerValid &&
    keyTemporalValid &&
    keySetExpiryValid &&
    !keyRevoked &&
    signatureValid &&
    subjectMatch &&
    resourceExpiryValid &&
    signatureExpiryValid &&
    (authority === undefined || authority.accepted);
  const verifiedOverall = overall && keySetValid && keyRecordValid;
  return {
    canonicalizationValid,
    digestMatch,
    signatureValid,
    keyTemporalValid,
    keyRevoked,
    keySetExpiryValid,
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
  const findings: Finding[] = [];
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
  const resourceExpiryValid = isResourceCurrent(value, options.now ?? new Date());
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
    delegationScopeValid: 'not-evaluated',
    rootAuthorityStatus: 'not-evaluated',
    resourceExpiryValid,
    subjectMatch: 'not-applicable',
    unsigned: true,
    overall: canonicalizationValid,
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
  if (header.alg !== 'EdDSA') {
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
  if (
    header.b64 !== false ||
    !Array.isArray(header.crit) ||
    new Set(header.crit).size !== header.crit.length ||
    header.crit.length !== 2 ||
    !header.crit.includes('b64') ||
    !header.crit.includes('eom') ||
    !isJsonObject(header.eom) ||
    header.eom.version !== '1.0' ||
    header.eom.canonicalization !== 'RFC8785-JCS'
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
  const metadata = isJsonObject(header.eom) ? header.eom : undefined;
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
  const sidecarExpires = stringAt(signature, ['expires']);
  const metadataExpiresPresent = metadata !== undefined && 'expires' in metadata;
  const sidecarExpiresPresent = isJsonObject(signature) && 'expires' in signature;
  if (
    metadata === undefined ||
    metadata.createdAt === undefined ||
    metadata.createdAt !== sidecarCreatedAt ||
    metadataExpiresPresent !== sidecarExpiresPresent ||
    (metadataExpiresPresent && metadata.expires !== sidecarExpires)
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
  if (header.cty !== contentType) {
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
  if (header.alg !== sidecarAlgorithm) {
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
  if (metadata && metadata.canonicalization !== sidecarCanonicalization) {
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
  if (Array.isArray(header.crit)) {
    for (const item of header.crit) {
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
  if (typeof header.kid !== 'string' || header.kid !== keyId || header.kid !== sidecarKeyId) {
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
  const expires = stringAt(signature, ['expires']);
  if (expires !== undefined && !isDateTime(expires)) {
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
      const rawValue = valueAt(keySet, [field]);
      const value = stringAt(keySet, [field]);
      if (rawValue === undefined || (value !== undefined && isDateTime(value))) continue;
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
    publicJwk.kty !== 'OKP' ||
    publicJwk.crv !== 'Ed25519' ||
    typeof publicJwk.x !== 'string' ||
    !/^[A-Za-z0-9_-]+$/u.test(publicJwk.x) ||
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
    if (valueAt(record, [field]) !== undefined && (value === undefined || !isDateTime(value))) {
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
    jwk.kty !== 'OKP' ||
    jwk.crv !== 'Ed25519' ||
    typeof jwk.x !== 'string'
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
  const validFrom = stringAt(record, ['validFrom']);
  const validUntil = stringAt(record, ['validUntil']);
  const from =
    validFrom === undefined
      ? undefined
      : isDateTime(validFrom)
        ? Date.parse(validFrom)
        : Number.NaN;
  const until =
    validUntil === undefined
      ? undefined
      : isDateTime(validUntil)
        ? Date.parse(validUntil)
        : Number.NaN;
  return (
    (from === undefined || (!Number.isNaN(from) && from <= now.getTime())) &&
    (until === undefined || (!Number.isNaN(until) && until >= now.getTime()))
  );
}

function isDateTime(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isPast(value: unknown, path: readonly string[], now: Date): boolean {
  const date = stringAt(value, path);
  return date !== undefined && Date.parse(date) <= now.getTime();
}

function isResourceCurrent(value: unknown, now: Date): boolean {
  const expires = stringAt(value, ['expires']);
  return expires === undefined || Date.parse(expires) >= now.getTime();
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

function canonicalValue(value: JsonValue, depth = 0, visited = new WeakSet<object>()): string {
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
    assertAcyclic(value, visited);
    try {
      return `[${value.map((item) => canonicalValue(item, depth + 1, visited)).join(',')}]`;
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
        return `${JSON.stringify(key)}:${canonicalValue(value[key] as JsonValue, depth + 1, visited)}`;
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
): value is JsonValue {
  if (depth > MAX_SIGNATURE_JSON_DEPTH)
    throw new SignaturePolicyError(
      'EOM_CANONICALIZATION_DEPTH',
      `JSON nesting exceeds the ${MAX_SIGNATURE_JSON_DEPTH}-level safety limit.`,
    );
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) {
    if (visited.has(value)) return false;
    visited.add(value);
    try {
      return value.every((item) => isJsonValue(item, depth + 1, visited));
    } finally {
      visited.delete(value);
    }
  }
  if (isJsonObject(value)) {
    if (visited.has(value)) return false;
    visited.add(value);
    try {
      return Object.values(value).every((item) => isJsonValue(item, depth + 1, visited));
    } finally {
      visited.delete(value);
    }
  }
  return false;
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
    if (!isJsonObject(current)) return undefined;
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
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new SignaturePolicyError(
      'EOM_SIGNATURE_TIME_INVALID',
      'Signature creation time is invalid.',
    );
  return parsed.toISOString();
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
