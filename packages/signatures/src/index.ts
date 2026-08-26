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
import { finding, type Finding } from '@paperandslate/eom-validator';

export interface SignOptions {
  readonly privateKey: KeyObject | string | Uint8Array;
  readonly keyId: string;
  readonly subject?: string;
  readonly signatureId?: string;
  readonly canonical?: string;
  readonly createdAt?: Date | string;
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
  readonly delegationScopeValid: boolean | 'not-evaluated';
  readonly rootAuthorityStatus: 'accepted' | 'rejected' | 'not-evaluated';
  readonly resourceExpiryValid: boolean;
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
  const protectedHeader = {
    alg: 'EdDSA',
    b64: false,
    crit: ['b64', 'eom'],
    cty: 'application/json',
    eom: 'RFC8785-JCS',
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
  const createdAt = toIso(options.createdAt ?? new Date());
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
    recordProfileValid && header !== undefined && validateProtectedHeader(header, keyId, findings);
  const keyRecord = keyId ? findKey(keySet, keyId) : undefined;
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
  if (canonicalPayload && protectedValue && signatureValue && headerValid && keyRecord) {
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
  let authority: AuthorityResult | undefined;
  const hasAuthorityInputs =
    options.manifest !== undefined &&
    options.resource !== undefined &&
    options.finalUrl !== undefined;
  if (hasAuthorityInputs) {
    authority = evaluateAuthority(options.manifest, options.resource, options.finalUrl as string, {
      now,
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
    !keyRevoked &&
    signatureValid &&
    subjectMatch &&
    resourceExpiryValid &&
    (authority === undefined || authority.accepted);
  return {
    canonicalizationValid,
    digestMatch,
    signatureValid,
    keyTemporalValid,
    keyRevoked,
    delegationScopeValid,
    rootAuthorityStatus,
    resourceExpiryValid,
    subjectMatch,
    unsigned: false,
    overall,
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
      decodeBase64Url(value).toString('utf8'),
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
    !header.crit.includes('b64') ||
    header.eom !== 'RFC8785-JCS'
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
  if (typeof header.kid !== 'string' || header.kid !== keyId) {
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
  if (stringAt(signature, ['algorithm']) !== 'EdDSA') {
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
  if (stringAt(signature, ['canonicalization']) !== 'RFC8785-JCS') {
    findings.push(
      finding(
        'EOM_SIGNATURE_PROFILE_INVALID',
        'integrity',
        'The signature record must declare RFC8785-JCS.',
        {
          severity: 'error',
        },
      ),
    );
    valid = false;
  }
  if (valueAt(signature, ['detached']) !== true) {
    findings.push(
      finding(
        'EOM_SIGNATURE_PROFILE_INVALID',
        'integrity',
        'The signature record must be detached.',
        {
          severity: 'error',
        },
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
  const from = validFrom === undefined ? undefined : Date.parse(validFrom);
  const until = validUntil === undefined ? undefined : Date.parse(validUntil);
  return (
    (from === undefined || (!Number.isNaN(from) && from <= now.getTime())) &&
    (until === undefined || (!Number.isNaN(until) && until >= now.getTime()))
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
  if (!/^[A-Za-z0-9_-]+$/u.test(value))
    throw new SignaturePolicyError(
      'EOM_SIGNATURE_BASE64_INVALID',
      'Signature encoding is not valid base64url.',
    );
  const padded =
    value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function canonicalValue(value: JsonValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new SignaturePolicyError(
        'EOM_CANONICALIZATION_NUMBER',
        'Non-finite numbers are not valid JCS values.',
      );
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(',')}]`;
  const entries = Object.keys(value).sort(jcsKeyCompare);
  return `{${entries.map((key) => `${JSON.stringify(key)}:${canonicalValue(value[key] as JsonValue)}`).join(',')}}`;
}

function jcsKeyCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isJsonObject(value)) return Object.values(value).every(isJsonValue);
  return false;
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
