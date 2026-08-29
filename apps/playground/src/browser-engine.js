import { parseDocument } from 'yaml';
import { parseStrictJson } from '@paperandslate/eom-core/json';
import { isValidDateTime } from '@paperandslate/eom-core/time';
import { evaluateAuthority, resourceDescriptorMatchesDocument } from '@paperandslate/eom-authority';
import { semanticFindings } from '../../../packages/validator/src/semantic.ts';
import schemas from './generated-schemas.js';
import { validatorsById } from './generated-validators.js';

const SCHEMA_BASE = 'https://paperandslate.org/schemas/eom/1.0/';
export const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_BROWSER_JSON_DEPTH = 128;
const MAX_BROWSER_JSON_NODES = 100_000;
const MAX_BROWSER_PROTECTED_HEADER_BYTES = 64 * 1024;
const MAX_BROWSER_PROTECTED_HEADER_BASE64URL_LENGTH =
  Math.ceil(MAX_BROWSER_PROTECTED_HEADER_BYTES / 3) * 4;
const TYPE_TO_SCHEMA = {
  manifest: 'manifest.schema.json',
  resource: 'resource.schema.json',
  capability: 'capability.schema.json',
  delegation: 'delegation.schema.json',
  provenance: 'provenance.schema.json',
  'source-record': 'source.schema.json',
  'claim-record': 'evidence.schema.json',
  'conflict-record': 'conflict.schema.json',
  'review-decision': 'review.schema.json',
  'candidate-workspace': 'candidate.schema.json',
  signature: 'signature.schema.json',
  'mapping-registry': 'mapping.schema.json',
  'module-registry': 'module-registry.schema.json',
  'vocabulary-registry': 'vocabulary-registry.schema.json',
  vocabulary: 'vocabulary.schema.json',
  'conformance-profile': 'conformance-profile.schema.json',
  'conformance-profile-registry': 'conformance-profile-registry.schema.json',
  'organization-profile': 'organization-profile.schema.json',
  'organization-index': 'organization-index.schema.json',
  'resource-index': 'resource-index.schema.json',
  'contact-directory': 'contact-directory.schema.json',
  'key-set': 'key-set.schema.json',
  'conformance-report': 'conformance-report.schema.json',
};

export function browserSchemaCatalog() {
  return schemas
    .filter((schema) => typeof schema.$id === 'string')
    .map((schema) => ({
      id: schema.$id,
      ...(typeof schema.title === 'string' ? { title: schema.title } : {}),
      type: Object.entries(TYPE_TO_SCHEMA).find(([, file]) => schema.$id.endsWith(`/${file}`))?.[0],
    }))
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

export function parseBrowserSource(text, kind) {
  if (typeof text !== 'string') throw new Error('Browser input must be text.');
  if (!text.trim()) throw new Error('Enter a document before running a local check.');
  // Count UTF-8 bytes without first allocating an encoded copy of an
  // attacker-controlled string. This accepts all inputs up to the actual
  // limit (rather than rejecting safe ASCII at a conservative UTF-8 bound).
  if (!withinUtf8Limit(text, MAX_SOURCE_BYTES)) {
    throw new Error('The browser input exceeds the 2 MiB safety limit.');
  }
  if (kind === 'json') return parseStrictJson(text, 'browser input');
  if (/(^|(?:\s|:|\[|,|-))(?:&|\*)[A-Za-z0-9_-]+/mu.test(text)) {
    throw new Error('YAML anchors and aliases are not allowed in public authoring input.');
  }
  const document = parseDocument(text, {
    schema: 'core',
    strict: true,
    uniqueKeys: true,
    prettyErrors: true,
  });
  if (document.errors.length > 0) {
    throw new Error(
      `YAML parsing failed: ${document.errors.map((error) => error.message).join(' ')}`,
    );
  }
  const value = document.toJS({ maxAliasCount: 0 });
  assertJsonSafe(value, 0);
  return value;
}

function withinUtf8Limit(value, limit) {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
    if (bytes > limit) return false;
  }
  return true;
}

export function validateBrowserDocument(value, options = {}) {
  if (!isPlainObject(value)) {
    return result(false, false, false, [
      browserFinding(
        'EOM_DOCUMENT_OBJECT_REQUIRED',
        'structural',
        'The publication must be a JSON object.',
        '/',
      ),
    ]);
  }
  let normalizedValue;
  try {
    normalizedValue = normalizeBrowserJson(value, 'browser document');
  } catch (error) {
    return result(false, false, false, [
      browserFinding(
        'EOM_DOCUMENT_JSON_REQUIRED',
        'structural',
        error instanceof Error ? error.message : 'The publication must contain only JSON values.',
        '/',
      ),
    ]);
  }
  if (!isPlainObject(normalizedValue)) {
    return result(false, false, false, [
      browserFinding(
        'EOM_DOCUMENT_OBJECT_REQUIRED',
        'structural',
        'The publication must be a JSON object.',
        '/',
      ),
    ]);
  }
  const evaluationTime = evaluationDate(options.now);
  const now = evaluationTime ?? new Date(0);
  const type =
    Object.hasOwn(normalizedValue, 'type') && typeof normalizedValue.type === 'string'
      ? normalizedValue.type
      : undefined;
  const file = type ? (TYPE_TO_SCHEMA[type] ?? `modules/${type}.schema.json`) : undefined;
  const schema = file ? schemas.find((item) => item.$id === `${SCHEMA_BASE}${file}`) : undefined;
  const findings = [];
  if (!schema) {
    findings.push(
      browserFinding(
        'EOM_SCHEMA_UNKNOWN_TYPE',
        'structural',
        'No bundled EOM 1.0 schema is registered for this document type.',
        '/type',
      ),
    );
  } else {
    const validator = validatorsById[schema.$id];
    if (!validator) {
      findings.push(
        browserFinding(
          'EOM_SCHEMA_NOT_LOADED',
          'structural',
          `Schema ${file} could not be loaded.`,
          '/',
        ),
      );
    } else if (!validator(normalizedValue)) {
      for (const error of validator.errors ?? []) {
        let pointer = error.instancePath || '/';
        if (error.keyword === 'required' && typeof error.params?.missingProperty === 'string') {
          pointer = `${pointer}/${escapePointer(error.params.missingProperty)}`;
        }
        findings.push(
          browserFinding(
            `EOM_SCHEMA_${error.keyword.toUpperCase()}`,
            'structural',
            `${pointer} ${error.keyword}${error.message ? `: ${error.message}` : ''}`,
            pointer,
          ),
        );
      }
    }
  }
  if (options.now !== undefined && evaluationTime === undefined) {
    findings.push(
      browserFinding(
        'EOM_EVALUATION_TIME_INVALID',
        'security',
        'The browser evaluation time must be a valid RFC 3339 date-time or Date.',
        '/',
      ),
    );
  }
  findings.push(...semanticFindings(normalizedValue, { now }));
  const structural = !findings.some(
    (item) => item.category === 'structural' && item.severity === 'error',
  );
  const semantic = !findings.some(
    (item) => item.category === 'semantic' && item.severity === 'error',
  );
  return result(
    structural && semantic && !findings.some((item) => item.severity === 'error'),
    structural,
    semantic,
    findings,
  );
}

export function semanticDiffBrowser(before, after) {
  const normalizedBefore = normalizeBrowserJson(before, 'browser diff before value');
  const normalizedAfter = normalizeBrowserJson(after, 'browser diff after value');
  const changes = [];
  compareValue(normalizedBefore, normalizedAfter, '', changes);
  const breaking = changes.some(
    (change) =>
      change.kind === 'removed' ||
      change.path === '/id' ||
      change.path === '/type' ||
      change.path === '/canonical' ||
      change.path === '/version',
  );
  return { changed: changes.length > 0, breaking, changes };
}

export async function verifyDetachedBrowser(value, signature, keySet, options = {}) {
  const findings = [];
  if (!isPlainObject(value) || !isPlainObject(signature) || !isPlainObject(keySet)) {
    return {
      overall: false,
      keyScopeValid: false,
      findings: ['A signature and key-set object are required.'],
    };
  }
  let normalizedValue;
  let normalizedSignature;
  let normalizedKeySet;
  try {
    normalizedValue = normalizeBrowserJson(value, 'browser value');
    normalizedSignature = normalizeBrowserJson(signature, 'browser signature');
    normalizedKeySet = normalizeBrowserJson(keySet, 'browser key set');
  } catch (error) {
    return {
      overall: false,
      keyScopeValid: false,
      findings: [error instanceof Error ? error.message : 'Inputs must contain only JSON values.'],
    };
  }
  if (
    !isPlainObject(normalizedValue) ||
    !isPlainObject(normalizedSignature) ||
    !isPlainObject(normalizedKeySet)
  ) {
    return {
      overall: false,
      keyScopeValid: false,
      findings: ['A signature, resource, and key-set object are required.'],
    };
  }
  const evaluationTime = evaluationDate(options.now);
  const now = evaluationTime ?? new Date(0);
  if (options.now !== undefined && evaluationTime === undefined)
    findings.push('The verification time is invalid.');
  value = normalizedValue;
  signature = normalizedSignature;
  keySet = normalizedKeySet;
  appendSchemaErrors(signature, 'signature', findings);
  if (Object.keys(keySet).some((field) => field !== 'keys')) {
    appendSchemaErrors(keySet, 'key-set', findings);
  } else {
    appendKeySetFragmentErrors(keySet, findings);
  }
  for (const [field, expected] of [
    ['$schema', 'https://paperandslate.org/schemas/eom/1.0/signature.schema.json'],
    ['specification', 'https://paperandslate.org/spec/eom/1.0'],
    ['version', '1.0'],
    ['type', 'signature'],
    ['algorithm', 'EdDSA'],
    ['canonicalization', 'RFC8785-JCS'],
    ['detached', true],
  ]) {
    if (!Object.hasOwn(signature, field) || signature[field] !== expected)
      findings.push(`The signature field ${field} is invalid.`);
  }
  if (
    !Object.hasOwn(signature, 'id') ||
    typeof signature.id !== 'string' ||
    !isAbsoluteUri(signature.id)
  )
    findings.push('The signature id must be an absolute URI.');
  if (
    !Object.hasOwn(signature, 'canonical') ||
    typeof signature.canonical !== 'string' ||
    !isHttpsUri(signature.canonical)
  )
    findings.push('The signature canonical URL must be HTTPS.');
  if (
    !Object.hasOwn(signature, 'subject') ||
    typeof signature.subject !== 'string' ||
    !isAbsoluteUri(signature.subject)
  )
    findings.push('The signature subject must be an absolute URI.');
  if (
    !Object.hasOwn(signature, 'keyId') ||
    typeof signature.keyId !== 'string' ||
    !isAbsoluteUri(signature.keyId)
  )
    findings.push('The signature key id must be an absolute URI.');
  if (
    !Object.hasOwn(signature, 'createdAt') ||
    typeof signature.createdAt !== 'string' ||
    !validDate(signature.createdAt)
  )
    findings.push('The signature creation time is invalid.');
  const signatureHasExpires = Object.hasOwn(signature, 'expires');
  if (
    signatureHasExpires &&
    (typeof signature.expires !== 'string' || !validDate(signature.expires))
  )
    findings.push('The signature expiry time is invalid.');
  if (
    signatureHasExpires &&
    typeof signature.expires === 'string' &&
    validDate(signature.expires) &&
    Date.parse(signature.expires) < now.getTime()
  )
    findings.push('The detached signature has expired.');
  const resourceExpiresPresent = Object.hasOwn(value, 'expires');
  const resourceExpires = resourceExpiresPresent ? value.expires : undefined;
  if (
    resourceExpiresPresent &&
    (typeof resourceExpires !== 'string' || !validDate(resourceExpires))
  )
    findings.push('The signed resource expiry time is invalid.');
  if (
    typeof resourceExpires === 'string' &&
    validDate(resourceExpires) &&
    Date.parse(resourceExpires) < now.getTime()
  )
    findings.push('The signed resource has expired.');
  if (!Object.hasOwn(signature, 'contentType') || signature.contentType !== 'application/json')
    findings.push('The signature content type must be application/json.');
  if (
    typeof signature.subject === 'string' &&
    (!Object.hasOwn(value, 'id') || signature.subject !== value.id)
  )
    findings.push('The signature subject does not match the resource id.');
  if (
    !Object.hasOwn(signature, 'payloadDigest') ||
    typeof signature.payloadDigest !== 'string' ||
    !/^sha-256=:[A-Za-z0-9+/]+={0,2}:$/u.test(signature.payloadDigest)
  )
    findings.push('The signature payload digest is missing or malformed.');
  if (
    !Object.hasOwn(signature, 'protected') ||
    typeof signature.protected !== 'string' ||
    !/^[A-Za-z0-9_-]+$/u.test(signature.protected)
  )
    findings.push('The protected header encoding is invalid.');
  if (
    !Object.hasOwn(signature, 'signature') ||
    typeof signature.signature !== 'string' ||
    !/^[A-Za-z0-9_-]+$/u.test(signature.signature)
  )
    findings.push('The signature encoding is invalid.');
  if (
    !Object.hasOwn(signature, 'compact') ||
    typeof signature.compact !== 'string' ||
    signature.compact !== `${signature.protected}..${signature.signature}`
  )
    findings.push('The compact detached representation does not match the signature fields.');
  const key =
    Object.hasOwn(keySet, 'keys') && Array.isArray(keySet.keys)
      ? keySet.keys.find(
          (candidate) =>
            isPlainObject(candidate) &&
            Object.hasOwn(candidate, 'kid') &&
            candidate.kid === signature.keyId,
        )
      : undefined;
  const manifestKeySetBindingValid = validateManifestKeySetBinding(
    options.manifest,
    keySet,
    findings,
  );
  let keyScopeValid = false;
  if (
    !isPlainObject(key) ||
    !Object.hasOwn(key, 'publicKeyJwk') ||
    !isPlainObject(key.publicKeyJwk)
  )
    findings.push('The signature key is missing from the supplied key set.');
  if (isPlainObject(key)) {
    if (Object.hasOwn(key, 'status') && key.status !== 'active')
      findings.push('The signing key is not active.');
    if (
      Object.hasOwn(key, 'validFrom') &&
      (typeof key.validFrom !== 'string' ||
        !validDate(key.validFrom) ||
        Date.parse(key.validFrom) > now.getTime())
    )
      findings.push('The signing key is not yet valid.');
    if (
      Object.hasOwn(key, 'validUntil') &&
      (typeof key.validUntil !== 'string' ||
        !validDate(key.validUntil) ||
        Date.parse(key.validUntil) < now.getTime())
    )
      findings.push('The signing key has expired.');
    if (
      Object.hasOwn(key, 'revokedAt') &&
      typeof key.revokedAt === 'string' &&
      validDate(key.revokedAt) &&
      Date.parse(key.revokedAt) <= now.getTime()
    )
      findings.push('The signing key has been revoked.');
    if (Object.hasOwn(key, 'alg') && key.alg !== 'EdDSA')
      findings.push('The signing key does not allow EdDSA.');
    if (
      Object.hasOwn(key, 'validFrom') &&
      Object.hasOwn(key, 'validUntil') &&
      typeof key.validFrom === 'string' &&
      typeof key.validUntil === 'string' &&
      validDate(key.validFrom) &&
      validDate(key.validUntil) &&
      Date.parse(key.validFrom) >= Date.parse(key.validUntil)
    )
      findings.push('The signing key validity interval is invalid.');
    if (
      !Object.hasOwn(key.publicKeyJwk, 'kty') ||
      !Object.hasOwn(key.publicKeyJwk, 'crv') ||
      !Object.hasOwn(key.publicKeyJwk, 'x') ||
      key.publicKeyJwk.kty !== 'OKP' ||
      key.publicKeyJwk.crv !== 'Ed25519' ||
      typeof key.publicKeyJwk.x !== 'string' ||
      'd' in key.publicKeyJwk
    )
      findings.push('The supplied key is not a public Ed25519 key.');
    keyScopeValid = evaluateKeyScope(key, value, findings);
  }
  if (
    Object.hasOwn(keySet, 'expires') &&
    typeof keySet.expires === 'string' &&
    validDate(keySet.expires) &&
    Date.parse(keySet.expires) < now.getTime()
  )
    findings.push('The verification key set has expired.');
  let payload;
  try {
    payload = canonicalJson(value);
  } catch (error) {
    findings.push(error instanceof Error ? error.message : 'The resource cannot be canonicalized.');
  }
  if (
    payload !== undefined &&
    typeof signature.payloadDigest === 'string' &&
    /^sha-256=:[A-Za-z0-9+/]+={0,2}:$/u.test(signature.payloadDigest)
  ) {
    const digest = await sha256Digest(payload);
    if (digest !== signature.payloadDigest)
      findings.push('The canonical payload digest does not match.');
  }
  let protectedHeader;
  if (typeof signature.protected === 'string' && /^[A-Za-z0-9_-]+$/u.test(signature.protected)) {
    try {
      if (signature.protected.length > MAX_BROWSER_PROTECTED_HEADER_BASE64URL_LENGTH)
        throw new Error('The protected header exceeds the 64 KiB safety limit.');
      const protectedBytes = fromBase64Url(signature.protected);
      if (protectedBytes.byteLength > MAX_BROWSER_PROTECTED_HEADER_BYTES)
        throw new Error('The protected header exceeds the 64 KiB safety limit.');
      let protectedText;
      try {
        protectedText = new TextDecoder('utf-8', { fatal: true }).decode(protectedBytes);
      } catch {
        throw new Error('The protected header is not valid UTF-8.');
      }
      const decoded = parseStrictJson(protectedText, 'protected header');
      if (!isPlainObject(decoded)) throw new Error('The protected header must be an object.');
      protectedHeader = decoded;
      if (
        !Object.hasOwn(decoded, 'alg') ||
        decoded.alg !== 'EdDSA' ||
        !Object.hasOwn(decoded, 'b64') ||
        decoded.b64 !== false ||
        !Object.hasOwn(decoded, 'eom') ||
        !isPlainObject(decoded.eom) ||
        !Object.hasOwn(decoded.eom, 'version') ||
        decoded.eom.version !== '1.0' ||
        !Object.hasOwn(decoded.eom, 'canonicalization') ||
        decoded.eom.canonicalization !== 'RFC8785-JCS' ||
        !Object.hasOwn(decoded, 'cty') ||
        decoded.cty !== 'application/json'
      )
        findings.push('The protected header does not declare the EOM detached profile.');
      if (
        !Array.isArray(decoded.crit) ||
        decoded.crit.length !== 2 ||
        !decoded.crit.includes('b64') ||
        !decoded.crit.includes('eom')
      )
        findings.push('The protected header critical parameters are invalid.');
      if (!Object.hasOwn(decoded, 'kid') || decoded.kid !== signature.keyId)
        findings.push('The protected header key id does not match the signature record.');
      const metadata = isPlainObject(decoded.eom) ? decoded.eom : undefined;
      if (
        metadata &&
        Object.keys(metadata).some(
          (field) => !['version', 'canonicalization', 'createdAt', 'expires'].includes(field),
        )
      )
        findings.push('The protected EOM lifetime object contains an unknown property.');
      const metadataExpiresPresent = metadata !== undefined && Object.hasOwn(metadata, 'expires');
      const sidecarExpiresPresent = Object.hasOwn(signature, 'expires');
      if (
        metadata === undefined ||
        !Object.hasOwn(metadata, 'createdAt') ||
        typeof metadata.createdAt !== 'string' ||
        metadata.createdAt !== signature.createdAt ||
        metadataExpiresPresent !== sidecarExpiresPresent ||
        (metadataExpiresPresent && metadata.expires !== signature.expires)
      )
        findings.push('Protected signature lifetime metadata must match the sidecar record.');
      if (
        signature.expires !== undefined &&
        typeof signature.createdAt === 'string' &&
        validDate(signature.createdAt) &&
        validDate(signature.expires) &&
        Date.parse(signature.createdAt) >= Date.parse(signature.expires)
      )
        findings.push('The signature expiry time must be later than its creation time.');
      if (
        Array.isArray(decoded.crit) &&
        decoded.crit.some((item) => item !== 'b64' && item !== 'eom')
      )
        findings.push('The protected header contains an unknown critical parameter.');
    } catch (error) {
      findings.push(error instanceof Error ? error.message : 'The protected header is invalid.');
    }
  }
  let cryptographic = false;
  if (
    findings.length === 0 &&
    payload !== undefined &&
    protectedHeader !== undefined &&
    typeof signature.protected === 'string' &&
    typeof signature.signature === 'string' &&
    isPlainObject(key) &&
    isPlainObject(key.publicKeyJwk)
  ) {
    try {
      const cryptoKey = await globalThis.crypto.subtle.importKey(
        'jwk',
        key.publicKeyJwk,
        { name: 'Ed25519' },
        false,
        ['verify'],
      );
      const input = new TextEncoder().encode(`${signature.protected}.${payload}`);
      cryptographic = await globalThis.crypto.subtle.verify(
        { name: 'Ed25519' },
        cryptoKey,
        fromBase64Url(signature.signature),
        input,
      );
      if (!cryptographic) findings.push('The detached Ed25519 signature is invalid.');
    } catch (error) {
      findings.push(
        error instanceof Error ? error.message : 'The browser could not verify this signature.',
      );
    }
  }
  // The signed document is not a trusted manifest descriptor.  Require the
  // descriptor explicitly so browser verification cannot manufacture
  // authority from the untrusted document itself.
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
  if (authorityContextRequested) {
    if (!authorityContextComplete) {
      findings.push(
        'EOM_AUTHORITY_CONTEXT_REQUIRED: Authority-aware signature verification requires a manifest, observed final URL, fetched resource descriptor, and observed root-manifest URL.',
      );
    } else {
      if (!resourceDescriptorMatchesDocument(authorityResource, value)) {
        findings.push(
          'EOM_AUTHORITY_DESCRIPTOR_MISMATCH: The fetched resource does not match the declared manifest descriptor.',
        );
      }
      const authority = evaluateAuthority(
        options.manifest,
        authorityResource,
        options.finalUrl,
        cryptographic && typeof signature.keyId === 'string'
          ? {
              now,
              verifiedKeyId: signature.keyId,
              requireObservedRoot: true,
              ...(typeof options.observedRootUrl === 'string'
                ? { observedRootUrl: options.observedRootUrl }
                : {}),
            }
          : {
              now,
              requireObservedRoot: true,
              ...(typeof options.observedRootUrl === 'string'
                ? { observedRootUrl: options.observedRootUrl }
                : {}),
            },
      );
      if (!authority.accepted) {
        findings.push(...authority.findings.map((item) => `${item.code}: ${item.message}`));
      }
    }
  }
  return {
    overall: findings.length === 0 && cryptographic && keyScopeValid && manifestKeySetBindingValid,
    keyScopeValid,
    findings,
  };
}

function compareValue(before, after, path, changes, depth = 0) {
  if (depth > MAX_BROWSER_JSON_DEPTH)
    throw new Error(`JSON nesting exceeds the ${MAX_BROWSER_JSON_DEPTH}-level safety limit.`);
  if (Array.isArray(before) && Array.isArray(after)) {
    const beforeIds = new Map(before.filter(isPlainObject).map((item) => [item.id, item]));
    const afterIds = new Map(after.filter(isPlainObject).map((item) => [item.id, item]));
    if (
      beforeIds.size > 0 &&
      beforeIds.size === before.filter(isPlainObject).length &&
      afterIds.size === after.filter(isPlainObject).length
    ) {
      for (const [id] of beforeIds)
        if (!afterIds.has(id))
          changes.push({ kind: 'removed', path: `${path}/@id/${escapePointer(String(id))}` });
      for (const [id, item] of afterIds) {
        if (!beforeIds.has(id))
          changes.push({ kind: 'added', path: `${path}/@id/${escapePointer(String(id))}` });
        else
          compareValue(
            beforeIds.get(id),
            item,
            `${path}/@id/${escapePointer(String(id))}`,
            changes,
            depth + 1,
          );
      }
      return;
    }
  }
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort()) {
      const childPath = `${path}/${escapePointer(key)}`;
      if (!Object.hasOwn(before, key)) changes.push({ kind: 'added', path: childPath });
      else if (!Object.hasOwn(after, key)) changes.push({ kind: 'removed', path: childPath });
      else compareValue(before[key], after[key], childPath, changes, depth + 1);
    }
    return;
  }
  if (JSON.stringify(before) !== JSON.stringify(after))
    changes.push({ kind: 'changed', path: path || '/' });
}

function canonicalJson(value, depth = 0, visited = new WeakSet(), state = { nodes: 0 }) {
  state.nodes += 1;
  if (state.nodes > MAX_BROWSER_JSON_NODES)
    throw new Error(`JSON value exceeds the ${MAX_BROWSER_JSON_NODES}-node safety limit.`);
  if (depth > MAX_BROWSER_JSON_DEPTH)
    throw new Error(`JSON nesting exceeds the ${MAX_BROWSER_JSON_DEPTH}-level safety limit.`);
  if (value === null || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    assertWellFormedUnicode(value);
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite numbers are not valid JCS values.');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    assertDenseArray(value);
    if (visited.has(value)) throw new Error('Cyclic values are not valid JSON.');
    visited.add(value);
    try {
      return `[${value.map((item) => canonicalJson(item, depth + 1, visited, state)).join(',')}]`;
    } finally {
      visited.delete(value);
    }
  }
  if (isPlainObject(value)) {
    if (visited.has(value)) throw new Error('Cyclic values are not valid JSON.');
    visited.add(value);
    try {
      return `{${Object.keys(value)
        .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
        .map((key) => {
          assertWellFormedUnicode(key);
          return `${JSON.stringify(key)}:${canonicalJson(value[key], depth + 1, visited, state)}`;
        })
        .join(',')}}`;
    } finally {
      visited.delete(value);
    }
  }
  throw new Error('Only JSON values can be canonicalized.');
}

async function sha256Digest(value) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return `sha-256=:${toBase64(new Uint8Array(digest))}:`;
}

function result(valid, structuralValid, semanticValid, findings) {
  return { valid, structuralValid, semanticValid, findings };
}

function browserFinding(code, category, message, pointer, severity = 'error') {
  return { code, category, severity, message, pointer };
}

function normalizeBrowserJson(value, label) {
  assertJsonSafe(value, 0);
  return stripObjectPrototypes(parseStrictJson(canonicalJson(value), label));
}

function stripObjectPrototypes(value) {
  if (Array.isArray(value)) {
    for (const item of value) stripObjectPrototypes(item);
    return value;
  }
  if (isPlainObject(value)) {
    Object.setPrototypeOf(value, null);
    for (const item of Object.values(value)) stripObjectPrototypes(item);
  }
  return value;
}

function appendSchemaErrors(value, type, findings) {
  const file = TYPE_TO_SCHEMA[type];
  const schema = schemas.find((item) => item.$id === `${SCHEMA_BASE}${file}`);
  const validator = schema ? validatorsById[schema.$id] : undefined;
  if (!validator) {
    findings.push(`The bundled ${type} schema is unavailable.`);
    return;
  }
  if (validator(value)) return;
  for (const error of validator.errors ?? []) {
    let pointer = error.instancePath || '/';
    if (error.keyword === 'required' && typeof error.params?.missingProperty === 'string') {
      pointer = `${pointer}/${escapePointer(error.params.missingProperty)}`;
    }
    findings.push(`${pointer} ${error.keyword}${error.message ? `: ${error.message}` : ''}`);
  }
}

function appendKeySetFragmentErrors(keySet, findings) {
  if (!Object.hasOwn(keySet, 'keys') || !Array.isArray(keySet.keys)) {
    findings.push('The verification key set must contain a keys array.');
    return;
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
  const seen = new Set();
  for (const [index, key] of keySet.keys.entries()) {
    if (!isPlainObject(key)) {
      findings.push(`/keys/${index} must be an object.`);
      continue;
    }
    for (const field of Object.keys(key)) {
      if (!allowedFields.has(field))
        findings.push(`/keys/${index}/${escapePointer(field)} is unsupported.`);
    }
    if (!Object.hasOwn(key, 'kid') || typeof key.kid !== 'string' || !isAbsoluteUri(key.kid))
      findings.push(`/keys/${index}/kid must be an absolute URI.`);
    if (typeof key.kid === 'string') {
      if (seen.has(key.kid)) findings.push(`/keys/${index}/kid must be unique.`);
      seen.add(key.kid);
    }
    if (Object.hasOwn(key, 'scope') && !isValidKeyScope(key.scope))
      findings.push(`/keys/${index}/scope is invalid.`);
    if (!Object.hasOwn(key, 'kty') || key.kty !== 'OKP')
      findings.push(`/keys/${index}/kty must be OKP.`);
    if (!Object.hasOwn(key, 'use') || key.use !== 'sig')
      findings.push(`/keys/${index}/use must be sig.`);
    if (!Object.hasOwn(key, 'alg') || key.alg !== 'EdDSA')
      findings.push(`/keys/${index}/alg must be EdDSA.`);
    if (!Object.hasOwn(key, 'status') || !['active', 'revoked', 'expired'].includes(key.status))
      findings.push(`/keys/${index}/status has an unsupported value.`);
    if (!Object.hasOwn(key, 'publicKeyJwk') || !isPlainObject(key.publicKeyJwk)) {
      findings.push(`/keys/${index}/publicKeyJwk must be an object.`);
    } else {
      for (const field of Object.keys(key.publicKeyJwk)) {
        if (!['kty', 'crv', 'x'].includes(field))
          findings.push(`/keys/${index}/publicKeyJwk/${escapePointer(field)} is unsupported.`);
      }
      if (!Object.hasOwn(key.publicKeyJwk, 'kty') || key.publicKeyJwk.kty !== 'OKP')
        findings.push(`/keys/${index}/publicKeyJwk/kty must be OKP.`);
      if (!Object.hasOwn(key.publicKeyJwk, 'crv') || key.publicKeyJwk.crv !== 'Ed25519')
        findings.push(`/keys/${index}/publicKeyJwk/crv must be Ed25519.`);
      if (
        !Object.hasOwn(key.publicKeyJwk, 'x') ||
        typeof key.publicKeyJwk.x !== 'string' ||
        !/^[A-Za-z0-9_-]+$/u.test(key.publicKeyJwk.x)
      )
        findings.push(`/keys/${index}/publicKeyJwk/x must be base64url text.`);
    }
    for (const field of ['validFrom', 'validUntil', 'revokedAt']) {
      if (Object.hasOwn(key, field) && (typeof key[field] !== 'string' || !validDate(key[field])))
        findings.push(`/keys/${index}/${field} must be a valid date-time.`);
    }
    if (
      typeof key.validFrom === 'string' &&
      typeof key.validUntil === 'string' &&
      validDate(key.validFrom) &&
      validDate(key.validUntil) &&
      Date.parse(key.validFrom) >= Date.parse(key.validUntil)
    )
      findings.push(`/keys/${index}/validUntil must be later than validFrom.`);
  }
}

function isValidKeyScope(scope) {
  if (!isPlainObject(scope)) return false;
  const keys = Object.keys(scope);
  if (keys.length === 0 || keys.some((key) => !['resourceTypes', 'resourceIds'].includes(key)))
    return false;
  if (Object.hasOwn(scope, 'resourceTypes')) {
    if (
      !Array.isArray(scope.resourceTypes) ||
      scope.resourceTypes.length === 0 ||
      !scope.resourceTypes.every((item) => typeof item === 'string' && item.length > 0) ||
      new Set(scope.resourceTypes).size !== scope.resourceTypes.length
    )
      return false;
  }
  if (Object.hasOwn(scope, 'resourceIds')) {
    if (
      !Array.isArray(scope.resourceIds) ||
      scope.resourceIds.length === 0 ||
      !scope.resourceIds.every((item) => typeof item === 'string' && isAbsoluteUri(item)) ||
      new Set(scope.resourceIds).size !== scope.resourceIds.length
    )
      return false;
  }
  return true;
}

function evaluateKeyScope(key, resource, findings) {
  if (!isPlainObject(key)) return false;
  const scope = key.scope;
  if (scope === undefined) return true;
  if (!isValidKeyScope(scope)) return false;
  const typeInScope =
    !Array.isArray(scope.resourceTypes) ||
    (typeof resource.type === 'string' && scope.resourceTypes.includes(resource.type));
  const idInScope =
    !Array.isArray(scope.resourceIds) ||
    (typeof resource.id === 'string' && scope.resourceIds.includes(resource.id));
  if (!typeInScope || !idInScope)
    findings.push(
      'EOM_SIGNATURE_KEY_OUT_OF_SCOPE: The signing key is not authorized for this resource.',
    );
  return typeInScope && idInScope;
}

function validateManifestKeySetBinding(manifest, keySet, findings) {
  if (manifest === undefined) return true;
  const signing =
    isPlainObject(manifest) && Object.hasOwn(manifest, 'signing') ? manifest.signing : undefined;
  if (signing === undefined) return true;
  if (!isPlainObject(signing)) {
    findings.push(
      'EOM_SIGNATURE_MANIFEST_KEY_SET_INVALID: The manifest signing declaration must be an object.',
    );
    return false;
  }
  if (
    typeof signing.keySet !== 'string' ||
    signing.keySet.length === 0 ||
    !isAbsoluteUri(signing.keySet)
  ) {
    findings.push(
      'EOM_SIGNATURE_MANIFEST_KEY_SET_REQUIRED: The manifest signing declaration must identify its key set.',
    );
    return false;
  }
  if (typeof keySet.id !== 'string' || !isAbsoluteUri(keySet.id) || keySet.id !== signing.keySet) {
    findings.push(
      'EOM_SIGNATURE_MANIFEST_KEY_SET_MISMATCH: The supplied verification key set does not match the manifest signing key-set identifier.',
    );
    return false;
  }
  return true;
}

function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertJsonSafe(value, depth, visited = new WeakSet(), state = { nodes: 0 }) {
  state.nodes += 1;
  if (state.nodes > MAX_BROWSER_JSON_NODES)
    throw new Error(`The browser input exceeds the ${MAX_BROWSER_JSON_NODES}-node safety limit.`);
  if (depth > MAX_BROWSER_JSON_DEPTH)
    throw new Error(`The browser input exceeds the ${MAX_BROWSER_JSON_DEPTH}-level nesting limit.`);
  if (value === undefined) throw new Error('Undefined values are not valid JSON publication data.');
  if (typeof value === 'string') assertWellFormedUnicode(value);
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new Error('Non-finite numbers are not valid JSON.');
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint')
    throw new Error('Only JSON values are supported.');
  if (value !== null && typeof value === 'object') {
    if (visited.has(value)) throw new Error('Cyclic values are not valid JSON.');
    visited.add(value);
    try {
      if (Array.isArray(value)) {
        assertDenseArray(value);
        for (let index = 0; index < value.length; index += 1) {
          assertJsonSafe(value[index], depth + 1, visited, state);
        }
      } else if (isPlainObject(value)) {
        Object.entries(value).forEach(([key, item]) => {
          assertWellFormedUnicode(key);
          assertJsonSafe(item, depth + 1, visited, state);
        });
      } else throw new Error('Only JSON objects and arrays are supported.');
    } finally {
      visited.delete(value);
    }
  }
}

function assertDenseArray(value) {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) throw new Error('Sparse arrays are not valid JSON values.');
  }
}

function assertWellFormedUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        index += 1;
        continue;
      }
      throw new Error('Unpaired UTF-16 surrogates are not valid publication text.');
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error('Unpaired UTF-16 surrogates are not valid publication text.');
    }
  }
}

function escapePointer(value) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function fromBase64Url(value) {
  if (!value || !/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1)
    throw new Error('Invalid base64url encoding.');
  const normalized = value
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(normalized);
  const decoded = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (toBase64Url(decoded) !== value) throw new Error('Non-canonical base64url encoding.');
  return decoded;
}

function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function isAbsoluteUri(value) {
  try {
    const url = new URL(value);
    return url.protocol.length > 1 && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isHttpsUri(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validDate(value) {
  return isValidDateTime(value);
}

function evaluationDate(value) {
  if (value === undefined) return new Date();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : new Date(value);
  if (typeof value !== 'string' || !validDate(value)) return undefined;
  return new Date(Date.parse(value));
}
