import {
  browserSchemaCatalog,
  parseBrowserSource,
  semanticDiffBrowser,
  validateBrowserDocument,
  verifyDetachedBrowser,
} from './browser-engine.js';

(() => {
  'use strict';

  const EOM_SPEC = 'https://paperandslate.org/spec/eom/1.0';
  const SCHEMA_BASE = 'https://paperandslate.org/schemas/eom/1.0/';
  const LANGUAGE_TAG = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;
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
  let lastValidation;

  function parseSource(text, kind) {
    return parseBrowserSource(text, kind);
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
      code.textContent = finding.code ?? 'EOM_BROWSER_FINDING';
      item.append(
        code,
        ` ${finding.severity ?? 'error'} · ${finding.message ?? 'No message'}${finding.pointer ? ` (${finding.pointer})` : ''}`,
      );
      findingList.append(item);
    }
  }

  function renderValidation(documentValue, validation) {
    lastValidation = validation;
    const reportButton = document.querySelector('#download-report-button');
    if (reportButton) reportButton.disabled = false;
    statusField.textContent = validation.valid
      ? 'Valid under the bundled EOM schema engine. Review provenance, authority, freshness, and truth separately.'
      : 'Invalid or needs review. Fix the findings below before treating this as a candidate.';
    statusField.className = `status ${validation.valid ? 'good' : 'bad'}`;
    renderFindings(validation.findings);
    rawReport.textContent = pretty({
      ...validation,
      documentType: documentValue && documentValue.type,
      engine: 'Ajv 2020-12 with bundled EOM schemas',
    });
  }

  function documentFromEditor() {
    const value = parseSource(sourceField.value, inputKind.value);
    lastDocument = value;
    return value;
  }

  function localError(message) {
    lastValidation = undefined;
    const reportButton = document.querySelector('#download-report-button');
    if (reportButton) reportButton.disabled = true;
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
    const links = collectUrls(value);
    const linkNote = document.createElement('p');
    linkNote.className = 'muted small';
    linkNote.textContent = `${links.length} URL value(s) found. The playground never follows them.`;
    exploreOutput.append(heading, definition, linkNote);
  }

  function renderSchemaBrowser() {
    exploreOutput.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = 'Bundled schema browser';
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = 'These are the immutable schema resources used by the browser validator.';
    const list = document.createElement('ul');
    for (const entry of browserSchemaCatalog()) {
      const item = document.createElement('li');
      item.textContent = `${entry.type ?? 'shared'} — ${entry.id}`;
      list.append(item);
    }
    exploreOutput.append(heading, note, list);
  }

  function renderSchemaOrg() {
    const value = lastDocument ?? documentFromEditor();
    if (!isPlainObject(value)) throw new Error('Schema.org preview requires an object document.');
    const projection = schemaOrgProjection(value);
    exploreOutput.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = 'Schema.org JSON-LD preview';
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent =
      'Projection only; EOM remains the richer source and no external certification is implied.';
    const output = document.createElement('pre');
    output.textContent = pretty(projection.document);
    const loss = document.createElement('p');
    loss.className = 'muted small';
    loss.textContent = `Mapping loss report: ${projection.omitted.length} EOM field(s) omitted or approximated.`;
    exploreOutput.append(heading, note, output, loss);
  }

  function renderCoverage() {
    const value = lastDocument ?? documentFromEditor();
    const published = new Set(
      Array.isArray(value?.resources)
        ? value.resources.map((resource) => (isPlainObject(resource) ? resource.type : undefined))
        : [],
    );
    exploreOutput.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = 'Module coverage';
    const list = document.createElement('ul');
    for (const type of [...moduleTypes].sort()) {
      const item = document.createElement('li');
      item.textContent = `${type}: ${published.has(type) ? 'linked by this root' : 'not linked (optional)'}`;
      list.append(item);
    }
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

  async function renderSignatureVerification() {
    const value = lastDocument ?? documentFromEditor();
    exploreOutput.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = 'Detached signature verifier';
    exploreOutput.append(heading);
    if (
      !isPlainObject(value?.resource) ||
      !isPlainObject(value?.signature) ||
      !isPlainObject(value?.keySet)
    ) {
      const message = document.createElement('p');
      message.textContent =
        'Load a JSON envelope with resource, signature, and keySet objects to run Ed25519 verification.';
      exploreOutput.append(message);
      return;
    }
    const result = await verifyDetachedBrowser(value.resource, value.signature, value.keySet);
    const message = document.createElement('p');
    message.textContent = result.overall
      ? 'The canonical digest and detached Ed25519 signature verify in this browser.'
      : `Signature verification failed: ${result.findings.join(' ')}`;
    exploreOutput.append(message);
  }

  function generateStarter() {
    const name = document.querySelector('#starter-name').value.trim();
    const originText = document.querySelector('#starter-origin').value.trim();
    const language = document.querySelector('#starter-language').value.trim();
    const organizationType = document.querySelector('#starter-type').value;
    const contactLabel = document.querySelector('#starter-contact').value.trim();
    if (!name) throw new Error('Enter an organization name.');
    const origin = new URL(originText);
    if (
      origin.protocol !== 'https:' ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash
    )
      throw new Error('Use an HTTPS origin without a path, query, credentials, or fragment.');
    if (!LANGUAGE_TAG.test(language)) throw new Error('Use a valid BCP 47 default language tag.');
    const base = origin.origin;
    const starter = {
      $schema: `${SCHEMA_BASE}organization-profile.schema.json`,
      specification: EOM_SPEC,
      version: '1.0',
      id: `${base}/eom/organization`,
      type: 'organization-profile',
      canonical: `${base}/eom/organization.json`,
      name,
      organizationType,
      defaultLanguage: language,
      supportedLanguages: [language],
      website: `${base}/`,
      ...(contactLabel
        ? { contacts: [{ id: `${base}/eom/contact/general-office`, name: contactLabel }] }
        : {}),
    };
    const validation = validateBrowserDocument(starter);
    if (!validation.valid)
      throw new Error(
        `Starter does not match the bundled schema: ${validation.findings.map((finding) => finding.message).join(' ')}`,
      );
    lastStarter = starter;
    starterOutput.textContent = pretty(starter);
    document.querySelector('#download-button').disabled = false;
    sourceField.value = pretty(starter);
    inputKind.value = 'json';
    lastDocument = starter;
    renderValidation(starter, validation);
  }

  function compareDocuments() {
    const left = lastDocument ?? documentFromEditor();
    const right = parseSource(compareField.value, inputKind.value);
    if (!isPlainObject(left) || !isPlainObject(right))
      throw new Error('The local diff expects two object documents.');
    compareOutput.textContent = pretty({
      ...semanticDiffBrowser(left, right),
      note: 'Semantic id-aware local comparison; no migration equivalence is claimed.',
    });
  }

  function downloadReport() {
    if (!lastValidation) return;
    const blob = new Blob([`${pretty(lastValidation)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'eom-validation-report.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function validateWithSameOriginService() {
    const status = document.querySelector('#url-validation-status');
    const serviceText = document.querySelector('#validation-service').value.trim();
    const targetText = document.querySelector('#public-validation-url').value.trim();
    if (!serviceText || !targetText)
      throw new Error('Enter both a same-origin service path and a public URL.');
    const service = new URL(serviceText, window.location.href);
    const target = new URL(targetText);
    if (service.origin !== window.location.origin)
      throw new Error('The validation service must share the current page origin.');
    if (target.protocol !== 'https:' || target.username || target.password)
      throw new Error('The target must be an HTTPS URL without credentials.');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(service, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ url: target.toString() }),
        credentials: 'omit',
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Validation service returned HTTP ${response.status}.`);
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().startsWith('application/json'))
        throw new Error('Validation service did not return JSON.');
      const report = await response.json();
      status.className = 'status good';
      status.textContent =
        'Remote validation completed. The response is displayed as untrusted report data only.';
      exploreOutput.textContent = pretty(report);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function schemaOrgProjection(value) {
    const type = value.type;
    const schemaType =
      type === 'course'
        ? 'Course'
        : type === 'event'
          ? 'Event'
          : type === 'job-posting'
            ? 'JobPosting'
            : type === 'news-item'
              ? 'NewsArticle'
              : 'EducationalOrganization';
    const document = {
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
    const mapped = new Set([
      'id',
      'type',
      'name',
      'description',
      'website',
      'code',
      'start',
      'end',
    ]);
    return {
      document,
      omitted: Object.keys(value)
        .filter((key) => !mapped.has(key))
        .sort(),
    };
  }

  function textValue(value) {
    if (typeof value === 'string') return value;
    if (!isPlainObject(value)) return undefined;
    const language = typeof value.default === 'string' ? value.default : undefined;
    const values = isPlainObject(value.values) ? value.values : undefined;
    const result = language && values ? values[language] : undefined;
    return typeof result === 'string' ? result : undefined;
  }

  function collectUrls(value, result = []) {
    if (Array.isArray(value)) value.forEach((child) => collectUrls(child, result));
    else if (isPlainObject(value))
      Object.values(value).forEach((child) => collectUrls(child, result));
    else if (typeof value === 'string') {
      try {
        if (new URL(value).protocol.length > 1) result.push(value);
      } catch {
        /* Non-URL strings are not links. */
      }
    }
    return result;
  }

  function pretty(value) {
    return JSON.stringify(stable(value), null, 2);
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

  function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  document.querySelector('#validate-button').addEventListener('click', () => {
    try {
      const value = documentFromEditor();
      renderValidation(value, validateBrowserDocument(value));
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
        {
          id: 'https://ecme-high.example/#organization',
          name: 'Ecme High School',
          type: 'school',
          canonicalUrl: 'https://ecme-high.example/',
        },
      ],
      capabilities: [],
      resources: [],
    };
    sourceField.value = pretty(fixture);
    inputKind.value = 'json';
    lastDocument = fixture;
    renderValidation(fixture, validateBrowserDocument(fixture));
  });
  document.querySelector('#clear-button').addEventListener('click', () => {
    sourceField.value = '';
    compareField.value = '';
    lastDocument = undefined;
    lastValidation = undefined;
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
  document.querySelector('#download-report-button')?.addEventListener('click', downloadReport);
  document.querySelector('#url-validation-button')?.addEventListener('click', () => {
    validateWithSameOriginService().catch((error) => {
      const status = document.querySelector('#url-validation-status');
      status.className = 'status bad';
      status.textContent = error instanceof Error ? error.message : String(error);
    });
  });
  document.querySelector('#explore-button').addEventListener('click', () => {
    try {
      renderExplorer();
    } catch (error) {
      exploreOutput.textContent = error instanceof Error ? error.message : String(error);
    }
  });
  document.querySelector('#schema-browser-button')?.addEventListener('click', renderSchemaBrowser);
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
    renderSignatureVerification().catch((error) => {
      exploreOutput.textContent = error instanceof Error ? error.message : String(error);
    });
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

  window.__EOM_PLAYGROUND__ = {
    parseSource,
    validateDocument: validateBrowserDocument,
    semanticDiff: semanticDiffBrowser,
    stable,
  };
})();
