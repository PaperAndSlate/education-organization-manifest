(() => {
  'use strict';

  const EOM_SPEC = 'https://paperandslate.org/spec/eom/1.0';
  const SCHEMA_BASE = 'https://paperandslate.org/schemas/eom/1.0/';
  const prohibitedKey =
    /(?:student|pupil|enrollment|grade|attendance|discipline|iep|504|sen|medical|safeguard|password|secret|token|credential|private.?key|api.?key)/iu;
  const languageTag = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;
  const moduleTypes = new Set([
    'campus-catalog',
    'department-catalog',
    'staff-directory',
    'course-catalog',
    'course-offering-catalog',
    'program-catalog',
    'academic-calendar',
    'event-catalog',
    'facility-catalog',
    'service-catalog',
    'policy-catalog',
    'admissions-profile',
    'sports-catalog',
    'transportation-catalog',
    'meal-menu-catalog',
    'club-catalog',
    'job-catalog',
    'news-feed',
    'statistics-profile',
    'api-reference',
  ]);
  const commonAllowed = new Set([
    '$schema',
    'specification',
    'version',
    'id',
    'type',
    'canonical',
    'publisher',
    'scope',
    'organizations',
    'organizationIndex',
    'capabilities',
    'resources',
    'delegations',
    'signing',
    'conformance',
    'contacts',
    'defaultLanguage',
    'supportedLanguages',
    'provenance',
    'modified',
    'expires',
    'extensions',
    'name',
    'title',
    'description',
    'organizationType',
    'alternateNames',
    'website',
    'parent',
    'children',
    'identifiers',
    'address',
    'campuses',
    'departments',
    'languages',
    'founded',
    'items',
    'subject',
    'subjects',
    'next',
    'total',
    'itemType',
    'chunks',
    'ordering',
    'snapshotAt',
    'catalogVersion',
    'releaseStatus',
    'license',
    'accessPolicy',
    'alternates',
    'authority',
    'profile',
    'schema',
    'mediaType',
    'integrity',
    'status',
    'implementation',
    'checks',
    'generatedAt',
    'profile',
    'keys',
    'canonicalization',
    'payloadDigest',
    'protected',
    'signature',
    'compact',
    'detached',
    'createdAt',
    'keyId',
    'algorithm',
    'subject',
    'scope',
    'validFrom',
    'validUntil',
    'transitive',
    'delegate',
    'review',
    'claims',
    'sourceSet',
    'directPublication',
  ]);
  const requiredByType = {
    manifest: [
      '$schema',
      'specification',
      'version',
      'id',
      'type',
      'canonical',
      'publisher',
      'scope',
      'organizations',
      'capabilities',
      'resources',
    ],
    'organization-profile': [
      '$schema',
      'specification',
      'version',
      'id',
      'type',
      'canonical',
      'name',
      'organizationType',
    ],
    'organization-index': [
      '$schema',
      'specification',
      'version',
      'id',
      'type',
      'canonical',
      'organizations',
    ],
    'resource-index': [
      '$schema',
      'specification',
      'version',
      'id',
      'type',
      'canonical',
      'itemType',
      'chunks',
    ],
    'contact-directory': [
      '$schema',
      'specification',
      'version',
      'id',
      'type',
      'canonical',
      'subject',
      'contacts',
    ],
    resource: ['id', 'type', 'href', 'mediaType', 'version', 'subjects'],
    capability: ['id', 'version', 'status'],
    delegation: ['id', 'delegate', 'scope', 'validFrom', 'transitive', 'status'],
    provenance: ['id', 'scope', 'source', 'observedAt'],
    'source-record': ['type', 'id', 'uri', 'title', 'sourceType', 'retrievedAt'],
    'claim-record': [
      'type',
      'id',
      'target',
      'proposedValue',
      'source',
      'evidence',
      'method',
      'confidence',
      'authorityClass',
      'privacyClass',
      'review',
    ],
    'conflict-record': ['type', 'id', 'target', 'claims', 'status', 'reason'],
    'review-decision': ['type', 'id', 'claimId', 'reviewer', 'timestamp', 'decision', 'rationale'],
    'candidate-workspace': [
      'type',
      'id',
      'createdAt',
      'status',
      'sourceSet',
      'claims',
      'directPublication',
    ],
    signature: [
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
    ],
    'key-set': ['$schema', 'specification', 'version', 'id', 'type', 'canonical', 'keys'],
    'conformance-report': [
      '$schema',
      'specification',
      'version',
      'id',
      'type',
      'canonical',
      'implementation',
      'status',
      'checks',
    ],
    'mapping-registry': ['type', 'version', 'mappings'],
  };

  const sourceField = document.querySelector('#source');
  const compareField = document.querySelector('#compare-source');
  const inputKind = document.querySelector('#input-kind');
  const statusField = document.querySelector('#validation-status');
  const findingList = document.querySelector('#finding-list');
  const rawReport = document.querySelector('#raw-report');
  const exploreOutput = document.querySelector('#explore-output');
  const starterOutput = document.querySelector('#starter-output');
  const compareOutput = document.querySelector('#compare-output');
  let lastDocument;
  let lastStarter;

  function parseSource(text, kind) {
    if (!text.trim()) throw new Error('Enter a document before running a local check.');
    if (kind === 'json') return JSON.parse(text);
    return parseSimpleYaml(text);
  }

  function parseSimpleYaml(text) {
    const lines = [];
    for (const raw of text.replace(/\r\n?/gu, '\n').split('\n')) {
      if (/\t/u.test(raw))
        throw new Error('Tabs are not supported in the safe browser YAML subset.');
      const withoutComment = stripYamlComment(raw);
      if (!withoutComment.trim() || /^(?:---|\.\.\.)$/u.test(withoutComment.trim())) continue;
      const indent = withoutComment.match(/^ */u)?.[0].length ?? 0;
      lines.push({ indent, text: withoutComment.slice(indent).trimEnd() });
    }
    if (lines.length === 0) throw new Error('The YAML document is empty.');
    let cursor = 0;

    function block(indent) {
      if (cursor >= lines.length || lines[cursor].indent < indent) return null;
      if (lines[cursor].indent !== indent)
        throw new Error(`Unexpected YAML indentation at line ${cursor + 1}.`);
      const sequence = lines[cursor].text === '-' || lines[cursor].text.startsWith('- ');
      const result = sequence ? [] : {};
      while (cursor < lines.length) {
        const line = lines[cursor];
        if (line.indent < indent) break;
        if (line.indent !== indent)
          throw new Error(`Unexpected YAML indentation at line ${cursor + 1}.`);
        if (sequence) {
          if (!(line.text === '-' || line.text.startsWith('- ')))
            throw new Error(`Expected a YAML list item at line ${cursor + 1}.`);
          const rest = line.text.slice(1).trim();
          cursor += 1;
          if (!rest) {
            result.push(
              cursor < lines.length && lines[cursor].indent > indent
                ? block(lines[cursor].indent)
                : null,
            );
            continue;
          }
          const pair = splitYamlKey(rest);
          if (!pair) {
            result.push(parseYamlScalar(rest));
            continue;
          }
          const object = {};
          object[pair.key] = readYamlValue(pair.value, indent);
          if (cursor < lines.length && lines[cursor].indent > indent) {
            const child = block(lines[cursor].indent);
            if (!isPlainObject(child))
              throw new Error(`Expected mapping properties after list item at line ${cursor}.`);
            Object.assign(object, child);
          }
          result.push(object);
          continue;
        }
        if (line.text.startsWith('-'))
          throw new Error(`Unexpected YAML list item at line ${cursor + 1}.`);
        const pair = splitYamlKey(line.text);
        if (!pair) throw new Error(`Expected a YAML mapping at line ${cursor + 1}.`);
        cursor += 1;
        result[pair.key] = readYamlValue(pair.value, indent);
      }
      return result;
    }

    function readYamlValue(raw, indent) {
      if (raw === '|' || raw === '>') {
        const values = [];
        while (cursor < lines.length && lines[cursor].indent > indent)
          values.push(lines[cursor++].text.trim());
        return values.join(raw === '|' ? '\n' : ' ');
      }
      if (raw) return parseYamlScalar(raw);
      return cursor < lines.length && lines[cursor].indent > indent
        ? block(lines[cursor].indent)
        : null;
    }

    const result = block(lines[0].indent);
    if (cursor < lines.length) throw new Error(`Could not parse YAML line ${cursor + 1}.`);
    return result;
  }

  function splitYamlKey(value) {
    const match = value.match(/^([^:]+):(?:\s+(.*)|\s*)$/u);
    return match ? { key: unquote(match[1].trim()), value: match[2]?.trim() ?? '' } : undefined;
  }

  function stripYamlComment(value) {
    let quote = '';
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index];
      if (quote) {
        if (character === quote && value[index - 1] !== '\\') quote = '';
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '#' && (index === 0 || /\s/u.test(value[index - 1] ?? ''))) {
        return value.slice(0, index).trimEnd();
      }
    }
    return value.trimEnd();
  }

  function parseYamlScalar(value) {
    const trimmed = value.trim();
    if (trimmed === 'null' || trimmed === '~') return null;
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(trimmed)) return Number(trimmed);
    if (
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('{') && trimmed.endsWith('}'))
    ) {
      try {
        return JSON.parse(trimmed);
      } catch {
        /* Fall through to a plain scalar. */
      }
    }
    return unquote(trimmed);
  }

  function unquote(value) {
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        return JSON.parse(value);
      } catch {
        return value.slice(1, -1);
      }
    }
    if (value.startsWith("'") && value.endsWith("'"))
      return value.slice(1, -1).replaceAll("''", "'");
    return value;
  }

  function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function validateDocument(value) {
    const findings = [];
    if (!isPlainObject(value)) {
      findings.push(
        browserFinding(
          'EOM_DOCUMENT_OBJECT_REQUIRED',
          'structural',
          'The document must be a JSON/YAML object.',
          '/',
        ),
      );
      return report(false, false, findings);
    }
    const type = typeof value.type === 'string' ? value.type : undefined;
    if (!type || (!requiredByType[type] && !moduleTypes.has(type))) {
      findings.push(
        browserFinding(
          'EOM_SCHEMA_UNKNOWN_TYPE',
          'structural',
          'No bundled browser rule is registered for this document type.',
          '/type',
        ),
      );
    }
    const required =
      requiredByType[type] ??
      (moduleTypes.has(type)
        ? ['$schema', 'specification', 'version', 'id', 'type', 'canonical', 'subjects', 'items']
        : []);
    for (const field of required)
      if (!(field in value))
        findings.push(
          browserFinding(
            'EOM_SCHEMA_REQUIRED',
            'structural',
            `Required field ${field} is missing.`,
            `/${escapePointer(field)}`,
          ),
        );
    for (const key of Object.keys(value))
      if (!commonAllowed.has(key))
        findings.push(
          browserFinding(
            'EOM_SCHEMA_ADDITIONAL_PROPERTIES',
            'structural',
            `Unknown top-level field ${key}; use namespaced extensions.`,
            `/${escapePointer(key)}`,
          ),
        );
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
    if (typeof value.defaultLanguage === 'string' && !languageTag.test(value.defaultLanguage))
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
        if (typeof language !== 'string' || !languageTag.test(language))
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
    walkPrivacy(value, '', findings, new Set());
    const structural = !findings.some(
      (item) => item.category === 'structural' && item.severity === 'error',
    );
    const semantic = !findings.some(
      (item) => item.category === 'semantic' && item.severity === 'error',
    );
    return report(structural && semantic, structural, findings, semantic);
  }

  function report(valid, structuralValid, findings, semanticValid = valid) {
    return { valid, structuralValid, semanticValid, findings };
  }

  function browserFinding(code, category, message, pointer) {
    return { code, category, severity: 'error', message, pointer };
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
      if (prohibitedKey.test(key)) {
        findings.push(
          browserFinding(
            'EOM_PRIVACY_PROHIBITED_FIELD',
            'privacy',
            'A prohibited or private-data field was found; remove it before publication.',
            childPointer,
          ),
        );
      } else {
        walkPrivacy(child, childPointer, findings, visited);
      }
    }
  }

  function isAbsoluteUri(value) {
    if (typeof value !== 'string' || /\s/u.test(value)) return false;
    try {
      return new URL(value).protocol.length > 1;
    } catch {
      return false;
    }
  }

  function isHttpsUri(value) {
    if (!isAbsoluteUri(value)) return false;
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }

  function escapePointer(value) {
    return value.replaceAll('~', '~0').replaceAll('/', '~1');
  }

  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (!isPlainObject(value)) return value;
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  }

  function pretty(value) {
    return JSON.stringify(stable(value), null, 2);
  }

  function renderFindings(findings) {
    findingList.replaceChildren();
    if (findings.length === 0) {
      const item = document.createElement('li');
      item.textContent = 'No local findings. This is format evidence, not factual verification.';
      findingList.append(item);
      return;
    }
    for (const finding of findings) {
      const item = document.createElement('li');
      const code = document.createElement('code');
      code.textContent = finding.code;
      item.append(
        code,
        ` ${finding.severity} · ${finding.message}${finding.pointer ? ` (${finding.pointer})` : ''}`,
      );
      findingList.append(item);
    }
  }

  function renderValidation(documentValue, validation) {
    statusField.textContent = validation.valid
      ? 'Valid under the local browser checks. Review provenance, authority, freshness, and truth separately.'
      : 'Invalid or needs review. Fix the findings below before treating this as a candidate.';
    statusField.className = `status ${validation.valid ? 'good' : 'bad'}`;
    renderFindings(validation.findings);
    rawReport.textContent = pretty({
      ...validation,
      documentType: documentValue && documentValue.type,
    });
  }

  function setDocument(documentValue, format) {
    lastDocument = documentValue;
    inputKind.value = format;
    sourceField.value = format === 'json' ? pretty(documentValue) : sourceField.value;
    const validation = validateDocument(documentValue);
    renderValidation(documentValue, validation);
    return validation;
  }

  function documentFromEditor() {
    const value = parseSource(sourceField.value, inputKind.value);
    lastDocument = value;
    return value;
  }

  function textValue(value) {
    if (typeof value === 'string') return value;
    if (!isPlainObject(value)) return undefined;
    const language = typeof value.default === 'string' ? value.default : undefined;
    const values = isPlainObject(value.values) ? value.values : undefined;
    const result = language && values ? values[language] : undefined;
    return typeof result === 'string' ? result : undefined;
  }

  function localError(message) {
    statusField.textContent = message;
    statusField.className = 'status bad';
    renderFindings([
      { code: 'EOM_BROWSER_INPUT_ERROR', category: 'syntax', severity: 'error', message },
    ]);
    rawReport.textContent = pretty({
      valid: false,
      findings: [{ code: 'EOM_BROWSER_INPUT_ERROR', message }],
    });
  }

  function renderExplorer() {
    const value = lastDocument ?? documentFromEditor();
    if (!isPlainObject(value)) throw new Error('Explore requires an object document.');
    exploreOutput.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = 'Manifest/resource explorer';
    exploreOutput.append(heading);
    const definition = document.createElement('dl');
    const entries = [
      ['Type', value.type ?? 'not declared'],
      ['ID', value.id ?? 'not declared'],
      ['Canonical', value.canonical ?? 'not declared'],
      ['Resources', Array.isArray(value.resources) ? value.resources.length : 0],
      ['Items', Array.isArray(value.items) ? value.items.length : 0],
      ['Organizations', Array.isArray(value.organizations) ? value.organizations.length : 0],
      ['Capabilities', Array.isArray(value.capabilities) ? value.capabilities.length : 0],
      ['Delegations', Array.isArray(value.delegations) ? value.delegations.length : 0],
    ];
    for (const [label, content] of entries) {
      const term = document.createElement('dt');
      term.textContent = label;
      const detail = document.createElement('dd');
      detail.textContent = String(content);
      definition.append(term, detail);
    }
    exploreOutput.append(definition);
    const links = collectUrls(value);
    const linkNote = document.createElement('p');
    linkNote.className = 'muted small';
    linkNote.textContent = `${links.length} URL value(s) found. The playground never follows them.`;
    exploreOutput.append(linkNote);
  }

  function collectUrls(value, result = []) {
    if (Array.isArray(value)) value.forEach((child) => collectUrls(child, result));
    else if (isPlainObject(value))
      Object.values(value).forEach((child) => collectUrls(child, result));
    else if (typeof value === 'string' && isAbsoluteUri(value)) result.push(value);
    return result;
  }

  function renderSchemaOrg() {
    const value = lastDocument ?? documentFromEditor();
    if (!isPlainObject(value)) throw new Error('Schema.org preview requires an object document.');
    const type = value.type;
    const schemaType =
      type === 'course'
        ? 'Course'
        : type === 'event'
          ? 'Event'
          : type === 'job'
            ? 'JobPosting'
            : type === 'news-item'
              ? 'NewsArticle'
              : 'EducationalOrganization';
    const result = {
      '@context': 'https://schema.org',
      '@type': schemaType,
      ...(typeof value.id === 'string' ? { '@id': value.id } : {}),
      ...(textValue(value.name) ? { name: textValue(value.name) } : {}),
      ...(textValue(value.description) ? { description: textValue(value.description) } : {}),
      ...(typeof value.website === 'string' ? { url: value.website } : {}),
      ...(schemaType === 'Course' && typeof value.code === 'string'
        ? { courseCode: value.code }
        : {}),
      ...(schemaType === 'Event' && typeof value.start === 'string'
        ? { startDate: value.start }
        : {}),
      ...(schemaType === 'Event' && typeof value.end === 'string' ? { endDate: value.end } : {}),
    };
    exploreOutput.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = 'Schema.org JSON-LD preview';
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent =
      'Projection only; EOM remains the richer source and no external certification is implied.';
    const output = document.createElement('pre');
    output.textContent = pretty(result);
    exploreOutput.append(heading, note, output);
  }

  function renderCoverage() {
    const value = lastDocument ?? documentFromEditor();
    const published = new Set(
      Array.isArray(value.resources)
        ? value.resources.map((resource) => (isPlainObject(resource) ? resource.type : undefined))
        : [],
    );
    const list = document.createElement('ul');
    for (const type of [...moduleTypes].sort()) {
      const item = document.createElement('li');
      item.textContent = `${type}: ${published.has(type) ? 'linked by this root' : 'not linked (optional)'}`;
      list.append(item);
    }
    exploreOutput.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = 'Module coverage';
    exploreOutput.append(heading, list);
  }

  function renderConformance() {
    const value = lastDocument ?? documentFromEditor();
    exploreOutput.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = 'Conformance report viewer';
    exploreOutput.append(heading);
    if (!isPlainObject(value) || value.type !== 'conformance-report') {
      const message = document.createElement('p');
      message.textContent =
        'The loaded document is not a conformance-report. Paste or load one, then select this view.';
      exploreOutput.append(message);
      return;
    }
    const checks = Array.isArray(value.checks) ? value.checks : [];
    const summary = document.createElement('p');
    summary.textContent = `Status: ${String(value.status ?? 'unknown')}. ${checks.length} check(s). A report describes a named implementation/profile; it is not an endorsement.`;
    const list = document.createElement('ul');
    for (const check of checks) {
      const item = document.createElement('li');
      item.textContent = isPlainObject(check)
        ? `${String(check.id ?? 'unnamed')}: ${String(check.status ?? 'unknown')}`
        : 'Malformed check';
      list.append(item);
    }
    exploreOutput.append(summary, list);
  }

  function renderSignatureShape() {
    const value = lastDocument ?? documentFromEditor();
    const required = [
      'type',
      'subject',
      'keyId',
      'algorithm',
      'canonicalization',
      'payloadDigest',
      'signature',
      'compact',
      'detached',
    ];
    const missing = required.filter((field) => !isPlainObject(value) || !(field in value));
    exploreOutput.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = 'Signature shape check';
    const message = document.createElement('p');
    message.textContent =
      missing.length === 0
        ? 'Required signature fields are present. Cryptographic verification still requires a supplied public key set and canonical payload.'
        : `Missing fields: ${missing.join(', ')}.`;
    exploreOutput.append(heading, message);
  }

  function generateStarter() {
    const name = document.querySelector('#starter-name').value.trim();
    const originText = document.querySelector('#starter-origin').value.trim();
    const language = document.querySelector('#starter-language').value.trim();
    const organizationType = document.querySelector('#starter-type').value;
    const contactLabel = document.querySelector('#starter-contact').value.trim();
    if (!name) throw new Error('Enter an organization name.');
    const origin = new URL(originText);
    if (origin.protocol !== 'https:') throw new Error('The starter origin must use HTTPS.');
    if (!languageTag.test(language)) throw new Error('Use a valid BCP 47 default language tag.');
    const base = origin.origin;
    const starter = {
      $schema: `${SCHEMA_BASE}organization-profile.schema.json`,
      specification: EOM_SPEC,
      version: '1.0',
      id: `${base}/eom/organization`,
      type: 'organization-profile',
      canonical: `${base}/`,
      name,
      organizationType,
      defaultLanguage: language,
      supportedLanguages: [language],
      website: `${base}/`,
      ...(contactLabel
        ? { contacts: [{ id: `${base}/eom/contact/general-office`, name: contactLabel }] }
        : {}),
    };
    lastStarter = starter;
    starterOutput.textContent = pretty(starter);
    document.querySelector('#download-button').disabled = false;
    sourceField.value = pretty(starter);
    inputKind.value = 'json';
    lastDocument = starter;
    renderValidation(starter, validateDocument(starter));
  }

  function compareDocuments() {
    const left = lastDocument ?? documentFromEditor();
    const right = parseSource(compareField.value, inputKind.value);
    if (!isPlainObject(left) || !isPlainObject(right))
      throw new Error('The local diff expects two object documents.');
    const leftKeys = new Set(Object.keys(left));
    const rightKeys = new Set(Object.keys(right));
    const added = [...rightKeys].filter((key) => !leftKeys.has(key)).sort();
    const removed = [...leftKeys].filter((key) => !rightKeys.has(key)).sort();
    const changed = [...leftKeys]
      .filter(
        (key) =>
          rightKeys.has(key) &&
          JSON.stringify(stable(left[key])) !== JSON.stringify(stable(right[key])),
      )
      .sort();
    compareOutput.textContent = pretty({
      added,
      removed,
      changed,
      note: 'Top-level local comparison only; no migration or semantic equivalence is claimed.',
    });
  }

  document.querySelector('#validate-button').addEventListener('click', () => {
    try {
      const value = documentFromEditor();
      renderValidation(value, validateDocument(value));
    } catch (error) {
      localError(error instanceof Error ? error.message : String(error));
    }
  });
  document.querySelector('#fixture-button').addEventListener('click', () => {
    const fixture = {
      $schema: `${SCHEMA_BASE}manifest.schema.json`,
      specification: EOM_SPEC,
      version: '1.0',
      id: 'https://ecme-high.example/eom/manifest',
      type: 'manifest',
      canonical: 'https://ecme-high.example/',
      publisher: {
        id: 'https://ecme-high.example/#publisher',
        name: 'Ecme High School',
        type: 'school',
      },
      scope: { origin: 'https://ecme-high.example', paths: ['/'] },
      organizations: [
        { id: 'https://ecme-high.example/#organization', name: 'Ecme High School', type: 'school' },
      ],
      capabilities: [],
      resources: [],
    };
    sourceField.value = pretty(fixture);
    inputKind.value = 'json';
    lastDocument = fixture;
    renderValidation(fixture, validateDocument(fixture));
  });
  document.querySelector('#clear-button').addEventListener('click', () => {
    sourceField.value = '';
    compareField.value = '';
    lastDocument = undefined;
    statusField.textContent = 'No document loaded.';
    statusField.className = 'status';
    renderFindings([]);
    rawReport.textContent = '{}';
    exploreOutput.textContent = 'Load a document, then choose a view.';
  });
  document.querySelector('#starter-button').addEventListener('click', () => {
    try {
      generateStarter();
    } catch (error) {
      starterOutput.textContent = error instanceof Error ? error.message : String(error);
    }
  });
  document.querySelector('#download-button').addEventListener('click', () => {
    if (!lastStarter) return;
    const blob = new Blob([`${pretty(lastStarter)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'eom-organization-profile.json';
    link.click();
    URL.revokeObjectURL(url);
  });
  document.querySelector('#explore-button').addEventListener('click', () => {
    try {
      renderExplorer();
    } catch (error) {
      exploreOutput.textContent = error instanceof Error ? error.message : String(error);
    }
  });
  document.querySelector('#schemaorg-button').addEventListener('click', () => {
    try {
      renderSchemaOrg();
    } catch (error) {
      exploreOutput.textContent = error instanceof Error ? error.message : String(error);
    }
  });
  document.querySelector('#coverage-button').addEventListener('click', () => {
    try {
      renderCoverage();
    } catch (error) {
      exploreOutput.textContent = error instanceof Error ? error.message : String(error);
    }
  });
  document.querySelector('#report-button').addEventListener('click', () => {
    try {
      renderConformance();
    } catch (error) {
      exploreOutput.textContent = error instanceof Error ? error.message : String(error);
    }
  });
  document.querySelector('#signature-button').addEventListener('click', () => {
    try {
      renderSignatureShape();
    } catch (error) {
      exploreOutput.textContent = error instanceof Error ? error.message : String(error);
    }
  });
  document.querySelector('#compare-button').addEventListener('click', () => {
    try {
      compareDocuments();
    } catch (error) {
      compareOutput.textContent = error instanceof Error ? error.message : String(error);
    }
  });
  document.querySelector('#file-input').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      sourceField.value = await file.text();
      inputKind.value = /\.(?:yaml|yml)$/iu.test(file.name) ? 'yaml' : 'json';
      lastDocument = undefined;
      statusField.textContent = `${file.name} loaded locally. Click Validate locally.`;
      statusField.className = 'status';
    } catch (error) {
      localError(error instanceof Error ? error.message : String(error));
    }
  });

  window.__EOM_PLAYGROUND__ = { parseSource, validateDocument, stable };
})();
