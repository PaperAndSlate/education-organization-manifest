import { parseDocument } from 'yaml';
import { parseStrictJson } from '@paperandslate/eom-core/json';
import { evaluateAuthority } from '@paperandslate/eom-authority';
import { semanticFindings } from '../../../packages/validator/src/semantic.ts';
import schemas from './generated-schemas.js';
import { validatorsById } from './generated-validators.js';

const SCHEMA_BASE = 'https://paperandslate.org/schemas/eom/1.0/';
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_BROWSER_JSON_DEPTH = 128;
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
  if (!text.trim()) throw new Error('Enter a document before running a local check.');
  if (new TextEncoder().encode(text).byteLength > MAX_SOURCE_BYTES) {
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
  const type = typeof value.type === 'string' ? value.type : undefined;
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
    } else if (!validator(value)) {
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
  findings.push(
    ...semanticFindings(value, { now: options.now ? new Date(options.now) : new Date() }),
  );
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
  assertJsonSafe(before, 0);
  assertJsonSafe(after, 0);
  const changes = [];
  compareValue(before, after, '', changes);
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
  if (!isPlainObject(signature) || !isPlainObject(keySet)) {
    return { overall: false, findings: ['A signature and key-set object are required.'] };
  }
  const now = options.now ? new Date(options.now) : new Date();
  if (Number.isNaN(now.getTime())) findings.push('The verification time is invalid.');
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
    if (signature[field] !== expected) findings.push(`The signature field ${field} is invalid.`);
  }
  if (typeof signature.id !== 'string' || !isAbsoluteUri(signature.id))
    findings.push('The signature id must be an absolute URI.');
  if (typeof signature.canonical !== 'string' || !isHttpsUri(signature.canonical))
    findings.push('The signature canonical URL must be HTTPS.');
  if (typeof signature.subject !== 'string' || !isAbsoluteUri(signature.subject))
    findings.push('The signature subject must be an absolute URI.');
  if (typeof signature.keyId !== 'string' || !isAbsoluteUri(signature.keyId))
    findings.push('The signature key id must be an absolute URI.');
  if (typeof signature.createdAt !== 'string' || !validDate(signature.createdAt))
    findings.push('The signature creation time is invalid.');
  if (
    typeof signature.expires !== 'undefined' &&
    (typeof signature.expires !== 'string' || !validDate(signature.expires))
  )
    findings.push('The signature expiry time is invalid.');
  if (
    signature.expires !== undefined &&
    typeof signature.expires === 'string' &&
    validDate(signature.expires) &&
    Date.parse(signature.expires) < now.getTime()
  )
    findings.push('The detached signature has expired.');
  const resourceExpires = isPlainObject(value) ? value.expires : undefined;
  if (
    resourceExpires !== undefined &&
    (typeof resourceExpires !== 'string' || !validDate(resourceExpires))
  )
    findings.push('The signed resource expiry time is invalid.');
  if (
    typeof resourceExpires === 'string' &&
    validDate(resourceExpires) &&
    Date.parse(resourceExpires) < now.getTime()
  )
    findings.push('The signed resource has expired.');
  if (signature.contentType !== 'application/json')
    findings.push('The signature content type must be application/json.');
  if (typeof signature.subject === 'string' && signature.subject !== value?.id)
    findings.push('The signature subject does not match the resource id.');
  if (
    typeof signature.payloadDigest !== 'string' ||
    !/^sha-256=:[A-Za-z0-9+/]+={0,2}:$/u.test(signature.payloadDigest)
  )
    findings.push('The signature payload digest is missing or malformed.');
  if (typeof signature.protected !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(signature.protected))
    findings.push('The protected header encoding is invalid.');
  if (typeof signature.signature !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(signature.signature))
    findings.push('The signature encoding is invalid.');
  if (
    typeof signature.compact !== 'string' ||
    signature.compact !== `${signature.protected}..${signature.signature}`
  )
    findings.push('The compact detached representation does not match the signature fields.');
  const key = Array.isArray(keySet.keys)
    ? keySet.keys.find((candidate) => isPlainObject(candidate) && candidate.kid === signature.keyId)
    : undefined;
  if (!isPlainObject(key) || !isPlainObject(key.publicKeyJwk))
    findings.push('The signature key is missing from the supplied key set.');
  if (isPlainObject(key)) {
    if (key.status !== undefined && key.status !== 'active')
      findings.push('The signing key is not active.');
    if (
      key.validFrom !== undefined &&
      (typeof key.validFrom !== 'string' ||
        !validDate(key.validFrom) ||
        Date.parse(key.validFrom) > now.getTime())
    )
      findings.push('The signing key is not yet valid.');
    if (
      key.validUntil !== undefined &&
      (typeof key.validUntil !== 'string' ||
        !validDate(key.validUntil) ||
        Date.parse(key.validUntil) < now.getTime())
    )
      findings.push('The signing key has expired.');
    if (
      key.revokedAt !== undefined &&
      typeof key.revokedAt === 'string' &&
      validDate(key.revokedAt) &&
      Date.parse(key.revokedAt) <= now.getTime()
    )
      findings.push('The signing key has been revoked.');
    if (key.alg !== undefined && key.alg !== 'EdDSA')
      findings.push('The signing key does not allow EdDSA.');
    if (
      key.validFrom !== undefined &&
      key.validUntil !== undefined &&
      typeof key.validFrom === 'string' &&
      typeof key.validUntil === 'string' &&
      validDate(key.validFrom) &&
      validDate(key.validUntil) &&
      Date.parse(key.validFrom) >= Date.parse(key.validUntil)
    )
      findings.push('The signing key validity interval is invalid.');
    if (
      key.publicKeyJwk.kty !== 'OKP' ||
      key.publicKeyJwk.crv !== 'Ed25519' ||
      typeof key.publicKeyJwk.x !== 'string' ||
      'd' in key.publicKeyJwk
    )
      findings.push('The supplied key is not a public Ed25519 key.');
  }
  if (
    keySet.expires !== undefined &&
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
      const decoded = parseStrictJson(
        new TextDecoder().decode(fromBase64Url(signature.protected)),
        'protected header',
      );
      if (!isPlainObject(decoded)) throw new Error('The protected header must be an object.');
      protectedHeader = decoded;
      if (
        decoded.alg !== 'EdDSA' ||
        decoded.b64 !== false ||
        !isPlainObject(decoded.eom) ||
        decoded.eom.version !== '1.0' ||
        decoded.eom.canonicalization !== 'RFC8785-JCS' ||
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
      if (decoded.kid !== signature.keyId)
        findings.push('The protected header key id does not match the signature record.');
      const metadata = isPlainObject(decoded.eom) ? decoded.eom : undefined;
      if (
        metadata &&
        Object.keys(metadata).some(
          (field) => !['version', 'canonicalization', 'createdAt', 'expires'].includes(field),
        )
      )
        findings.push('The protected EOM lifetime object contains an unknown property.');
      const metadataExpiresPresent = metadata !== undefined && 'expires' in metadata;
      const sidecarExpiresPresent = 'expires' in signature;
      if (
        metadata === undefined ||
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
  if (options.manifest !== undefined && options.finalUrl !== undefined) {
    const authority = evaluateAuthority(
      options.manifest,
      options.resource ?? value,
      options.finalUrl,
      cryptographic && typeof signature.keyId === 'string'
        ? { now, verifiedKeyId: signature.keyId }
        : { now },
    );
    if (!authority.accepted) {
      findings.push(...authority.findings.map((item) => `${item.code}: ${item.message}`));
    }
  }
  return { overall: findings.length === 0 && cryptographic, findings };
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

function canonicalJson(value, depth = 0, visited = new WeakSet()) {
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
    if (visited.has(value)) throw new Error('Cyclic values are not valid JSON.');
    visited.add(value);
    try {
      return `[${value.map((item) => canonicalJson(item, depth + 1, visited)).join(',')}]`;
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
          return `${JSON.stringify(key)}:${canonicalJson(value[key], depth + 1, visited)}`;
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
  if (!Array.isArray(keySet.keys)) {
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
    if (typeof key.kid !== 'string' || !isAbsoluteUri(key.kid))
      findings.push(`/keys/${index}/kid must be an absolute URI.`);
    if (typeof key.kid === 'string') {
      if (seen.has(key.kid)) findings.push(`/keys/${index}/kid must be unique.`);
      seen.add(key.kid);
    }
    if (key.kty !== 'OKP') findings.push(`/keys/${index}/kty must be OKP.`);
    if (key.use !== 'sig') findings.push(`/keys/${index}/use must be sig.`);
    if (key.alg !== 'EdDSA') findings.push(`/keys/${index}/alg must be EdDSA.`);
    if (!['active', 'revoked', 'expired'].includes(key.status))
      findings.push(`/keys/${index}/status has an unsupported value.`);
    if (!isPlainObject(key.publicKeyJwk)) {
      findings.push(`/keys/${index}/publicKeyJwk must be an object.`);
    } else {
      for (const field of Object.keys(key.publicKeyJwk)) {
        if (!['kty', 'crv', 'x'].includes(field))
          findings.push(`/keys/${index}/publicKeyJwk/${escapePointer(field)} is unsupported.`);
      }
      if (key.publicKeyJwk.kty !== 'OKP')
        findings.push(`/keys/${index}/publicKeyJwk/kty must be OKP.`);
      if (key.publicKeyJwk.crv !== 'Ed25519')
        findings.push(`/keys/${index}/publicKeyJwk/crv must be Ed25519.`);
      if (typeof key.publicKeyJwk.x !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(key.publicKeyJwk.x))
        findings.push(`/keys/${index}/publicKeyJwk/x must be base64url text.`);
    }
    for (const field of ['validFrom', 'validUntil', 'revokedAt']) {
      if (key[field] !== undefined && (typeof key[field] !== 'string' || !validDate(key[field])))
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

function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertJsonSafe(value, depth, visited = new WeakSet()) {
  if (depth > MAX_BROWSER_JSON_DEPTH)
    throw new Error(`The browser input exceeds the ${MAX_BROWSER_JSON_DEPTH}-level nesting limit.`);
  if (typeof value === 'string') assertWellFormedUnicode(value);
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new Error('Non-finite numbers are not valid JSON.');
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint')
    throw new Error('Only JSON values are supported.');
  if (value !== null && typeof value === 'object') {
    if (visited.has(value)) throw new Error('Cyclic values are not valid JSON.');
    visited.add(value);
    try {
      if (Array.isArray(value)) value.forEach((item) => assertJsonSafe(item, depth + 1, visited));
      else if (isPlainObject(value))
        Object.values(value).forEach((item) => assertJsonSafe(item, depth + 1, visited));
      else throw new Error('Only JSON objects and arrays are supported.');
    } finally {
      visited.delete(value);
    }
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
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}
