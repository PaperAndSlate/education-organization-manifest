import { parseDocument } from 'yaml';
import { isAbsoluteUri, isHttpsUri } from '@paperandslate/eom-core/ids';
import { parseStrictJson } from '@paperandslate/eom-core/json';
import schemas from './generated-schemas.js';
import { validatorsById } from './generated-validators.js';

const SCHEMA_BASE = 'https://paperandslate.org/schemas/eom/1.0/';
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const PROHIBITED_KEY =
  /(?:student|pupil|grade|attendance|discipline|iep|504|sen|medical|safeguard|password|secret|token|credential|private.?key|api.?key)/iu;
const LANGUAGE_TAG = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;
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
    .sort((left, right) => left.id.localeCompare(right.id));
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
  inspectSemantics(value, findings, options.now ? new Date(options.now) : new Date());
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

export async function verifyDetachedBrowser(value, signature, keySet) {
  const findings = [];
  if (!isPlainObject(signature) || !isPlainObject(keySet)) {
    return { overall: false, findings: ['A signature and key-set object are required.'] };
  }
  if (signature.algorithm !== 'EdDSA' || signature.canonicalization !== 'RFC8785-JCS') {
    findings.push('Only the EOM EdDSA/RFC8785-JCS profile is supported.');
  }
  const key = Array.isArray(keySet.keys)
    ? keySet.keys.find((candidate) => isPlainObject(candidate) && candidate.kid === signature.keyId)
    : undefined;
  if (!isPlainObject(key) || !isPlainObject(key.publicKeyJwk))
    findings.push('The signature key is missing from the supplied key set.');
  const payload = canonicalJson(value);
  if (typeof signature.payloadDigest !== 'string')
    findings.push('The signature payload digest is missing.');
  else {
    const digest = await sha256Base64Url(payload);
    if (digest !== signature.payloadDigest)
      findings.push('The canonical payload digest does not match.');
  }
  let cryptographic = false;
  if (
    findings.length === 0 &&
    typeof signature.protected === 'string' &&
    typeof signature.signature === 'string'
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
  return { overall: findings.length === 0 && cryptographic, findings };
}

function inspectSemantics(value, findings, now) {
  if (typeof value.id === 'string' && !isAbsoluteUri(value.id))
    findings.push(
      browserFinding(
        'EOM_ID_ABSOLUTE_REQUIRED',
        'semantic',
        'Reusable identifiers must be absolute URIs.',
        '/id',
      ),
    );
  if (typeof value.canonical === 'string' && !isHttpsUri(value.canonical))
    findings.push(
      browserFinding(
        'EOM_CANONICAL_HTTPS_REQUIRED',
        'semantic',
        'Canonical URLs must use HTTPS.',
        '/canonical',
      ),
    );
  if (typeof value.defaultLanguage === 'string' && !LANGUAGE_TAG.test(value.defaultLanguage))
    findings.push(
      browserFinding(
        'EOM_LANGUAGE_INVALID',
        'semantic',
        'defaultLanguage must be a BCP 47 language tag.',
        '/defaultLanguage',
      ),
    );
  if (Array.isArray(value.supportedLanguages))
    value.supportedLanguages.forEach((language, index) => {
      if (typeof language !== 'string' || !LANGUAGE_TAG.test(language))
        findings.push(
          browserFinding(
            'EOM_LANGUAGE_INVALID',
            'semantic',
            'supportedLanguages contains an invalid BCP 47 tag.',
            `/supportedLanguages/${index}`,
          ),
        );
    });
  if (
    typeof value.defaultLanguage === 'string' &&
    Array.isArray(value.supportedLanguages) &&
    value.supportedLanguages.length > 0 &&
    !value.supportedLanguages.includes(value.defaultLanguage)
  )
    findings.push(
      browserFinding(
        'EOM_DEFAULT_LANGUAGE_UNSUPPORTED',
        'semantic',
        'defaultLanguage must be listed in supportedLanguages.',
        '/defaultLanguage',
      ),
    );
  if (typeof value.modified === 'string' && typeof value.expires === 'string') {
    const modified = Date.parse(value.modified);
    const expires = Date.parse(value.expires);
    if (Number.isFinite(modified) && Number.isFinite(expires) && modified > expires)
      findings.push(
        browserFinding(
          'EOM_FRESHNESS_ORDER',
          'semantic',
          'modified must be earlier than or equal to expires.',
          '/expires',
        ),
      );
    if (Number.isFinite(expires) && expires < now.getTime())
      findings.push(
        browserFinding(
          'EOM_PUBLICATION_EXPIRED',
          'freshness',
          'The publication has passed its declared expiry.',
          '/expires',
          'warning',
        ),
      );
  }
  walkPrivacy(value, '', findings, new Set());
}

function walkPrivacy(value, pointer, findings, visited) {
  if (!value || typeof value !== 'object' || visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    value.forEach((child, index) => walkPrivacy(child, `${pointer}/${index}`, findings, visited));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPointer = `${pointer}/${escapePointer(key)}`;
    if (PROHIBITED_KEY.test(key))
      findings.push(
        browserFinding(
          'EOM_PRIVACY_PROHIBITED_FIELD',
          'privacy',
          'A prohibited or private-data field was found; remove it before publication.',
          childPointer,
        ),
      );
    else walkPrivacy(child, childPointer, findings, visited);
  }
}

function compareValue(before, after, path, changes) {
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
          );
      }
      return;
    }
  }
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort()) {
      const childPath = `${path}/${escapePointer(key)}`;
      if (!(key in before)) changes.push({ kind: 'added', path: childPath });
      else if (!(key in after)) changes.push({ kind: 'removed', path: childPath });
      else compareValue(before[key], after[key], childPath, changes);
    }
    return;
  }
  if (JSON.stringify(before) !== JSON.stringify(after))
    changes.push({ kind: 'changed', path: path || '/' });
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isPlainObject(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

async function sha256Base64Url(value) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(digest));
}

function result(valid, structuralValid, semanticValid, findings) {
  return { valid, structuralValid, semanticValid, findings };
}

function browserFinding(code, category, message, pointer, severity = 'error') {
  return { code, category, severity, message, pointer };
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertJsonSafe(value, depth) {
  if (depth > 100) throw new Error('The browser input exceeds the maximum nesting depth.');
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new Error('Non-finite numbers are not valid JSON.');
  if (Array.isArray(value)) value.forEach((item) => assertJsonSafe(item, depth + 1));
  else if (isPlainObject(value))
    Object.values(value).forEach((item) => assertJsonSafe(item, depth + 1));
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
  const normalized = value
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
