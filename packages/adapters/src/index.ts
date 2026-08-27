import { createHash } from 'node:crypto';
import {
  isAbsoluteUri,
  isJsonObject,
  type JsonObject,
  type JsonValue,
} from '@paperandslate/eom-core';
import { finding, type Finding } from '@paperandslate/eom-validator';

export type AdapterFormat =
  | 'schema-org-jsonld'
  | 'ceds-json'
  | 'ed-fi-json'
  | 'oneroster-json-csv'
  | 'case-json'
  | 'qti-xml'
  | 'lti-public-json'
  | 'common-cartridge-xml'
  | 'icalendar'
  | 'json-feed-rss-atom';

export interface AdapterOptions {
  readonly sourceId?: string;
  readonly observedAt?: string;
  readonly targetResourceId?: string;
  /** Maximum UTF-8 input size accepted by a direct adapter call. */
  readonly maxBytes?: number;
  /** Maximum object/array nesting accepted by a direct adapter call. */
  readonly maxDepth?: number;
  /** Maximum total array items accepted by a direct adapter call. */
  readonly maxItems?: number;
  /** Maximum object/array nodes accepted by a direct adapter call. */
  readonly maxNodes?: number;
}

export interface AdapterLossReport {
  readonly exact: readonly string[];
  readonly approximate: readonly string[];
  readonly omitted: readonly string[];
  readonly warnings: readonly string[];
}

export interface AdapterResult {
  readonly adapterId: string;
  readonly version: '1.0';
  readonly candidate?: JsonObject;
  readonly claims: readonly JsonObject[];
  readonly lossReport: AdapterLossReport;
  readonly findings: readonly Finding[];
  readonly quarantined: boolean;
  readonly publication: 'candidate-only';
}

export interface AdapterExportResult {
  readonly adapterId: string;
  readonly version: '1.0';
  readonly document: JsonObject | string;
  readonly lossReport: AdapterLossReport;
  readonly findings: readonly Finding[];
  readonly publication: 'preview-only';
}

export interface AdapterDefinition {
  readonly id: string;
  readonly format: AdapterFormat;
  readonly sourceVersion: string;
  readonly direction: 'import' | 'export' | 'bidirectional';
  readonly status: 'preview';
  readonly modules: readonly string[];
  readonly publicFieldAllowlist: readonly string[];
  readonly certificationClaim: false;
}

const defaultSourceId = 'https://paperandslate.org/eom/controlled-fixture/source';
const defaultObservedAt = '2026-08-26T00:00:00Z';

const definitions: readonly AdapterDefinition[] = [
  definition(
    'schema-org-jsonld',
    'Schema.org vocabulary / JSON-LD 1.1',
    'bidirectional',
    ['organization-profile', 'course-catalog', 'event-catalog', 'job-catalog', 'news-feed'],
    [
      '@id',
      '@type',
      'name',
      'alternateName',
      'description',
      'url',
      'courseCode',
      'provider',
      'coursePrerequisites',
      'educationalLevel',
      'inLanguage',
      'startDate',
      'endDate',
      'location',
      'sameAs',
      'address',
      'geo',
    ],
  ),
  definition(
    'ceds-json',
    'CEDS-aligned public projection',
    'bidirectional',
    [
      'organization-profile',
      'campus-catalog',
      'department-catalog',
      'course-catalog',
      'academic-calendar',
    ],
    [
      'organizationId',
      'name',
      'organizationType',
      'website',
      'address',
      'courseCode',
      'courseTitle',
      'schoolYear',
      'sessionName',
    ],
  ),
  definition(
    'ed-fi-json',
    'Ed-Fi public projection',
    'import',
    ['organization-profile', 'campus-catalog', 'course-catalog', 'program-catalog'],
    [
      'educationOrganizationId',
      'nameOfInstitution',
      'shortNameOfInstitution',
      'webSite',
      'courseCode',
      'courseTitle',
      'academicSubject',
    ],
  ),
  definition(
    'oneroster-json-csv',
    'OneRoster public allowlist',
    'import',
    ['organization-profile', 'course-catalog', 'course-offering-catalog', 'academic-calendar'],
    [
      'sourcedId',
      'name',
      'type',
      'identifier',
      'courseCode',
      'title',
      'classCode',
      'schoolYear',
      'term',
    ],
  ),
  definition(
    'case-json',
    'CASE public framework/item projection',
    'import',
    ['course-catalog', 'program-catalog'],
    ['uri', 'identifier', 'fullStatement', 'humanCodingScheme', 'CFDocumentURI', 'CFItemType'],
  ),
  definition(
    'qti-xml',
    'QTI public resource metadata',
    'import',
    ['course-catalog', 'api-reference'],
    ['identifier', 'title', 'description', 'qtiVersion', 'license', 'href'],
  ),
  definition(
    'lti-public-json',
    'LTI public service metadata',
    'import',
    ['api-reference', 'service-catalog'],
    ['name', 'description', 'url', 'logo', 'scopes', 'documentation'],
  ),
  definition(
    'common-cartridge-xml',
    'Common Cartridge public package metadata',
    'import',
    ['course-catalog', 'api-reference'],
    ['identifier', 'title', 'description', 'href', 'license', 'digest', 'formatVersion'],
  ),
  definition(
    'icalendar',
    'RFC 5545 public event projection',
    'bidirectional',
    ['event-catalog', 'course-offering-catalog', 'academic-calendar'],
    ['UID', 'SUMMARY', 'DESCRIPTION', 'DTSTART', 'DTEND', 'LOCATION', 'URL'],
  ),
  definition(
    'json-feed-rss-atom',
    'JSON Feed 1.1 / RSS 2.0 / Atom 1.0 public projection',
    'import',
    ['news-feed', 'event-catalog'],
    [
      'id',
      'url',
      'title',
      'content_text',
      'content_html',
      'summary',
      'published',
      'updated',
      'link',
      'description',
    ],
  ),
];

const prohibitedInputKey =
  /(?:student|pupil|enrollment|grade|attendance|discipline|iep|504|sen|medical|safeguard|accommodation|password|secret|token|credential|private.?key|api.?key)/iu;

const DEFAULT_ADAPTER_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_ADAPTER_MAX_DEPTH = 64;
const DEFAULT_ADAPTER_MAX_ITEMS = 10_000;
const DEFAULT_ADAPTER_MAX_NODES = 50_000;
const HARD_ADAPTER_MAX_BYTES = 32 * 1024 * 1024;
const HARD_ADAPTER_MAX_DEPTH = 128;
const HARD_ADAPTER_MAX_ITEMS = 100_000;
const HARD_ADAPTER_MAX_NODES = 200_000;

export function adapterDefinitions(): readonly AdapterDefinition[] {
  return definitions;
}

export function supportedAdapterFormats(): readonly AdapterFormat[] {
  return definitions.map((item) => item.format);
}

export function mapInput(
  format: AdapterFormat,
  input: unknown,
  options: AdapterOptions = {},
): AdapterResult {
  const definitionValue = definitions.find((item) => item.format === format);
  if (!definitionValue) return rejectedResult(format, 'Unknown adapter format.');
  const limitFindings = inspectInputLimits(input, options);
  if (limitFindings.length > 0) return limitedResult(definitionValue, limitFindings);
  const privacyFindings = inspectInputPrivacy(input);
  if (privacyFindings.length > 0) {
    return {
      adapterId: definitionValue.id,
      version: '1.0',
      claims: [],
      lossReport: loss([], [], ['prohibited input quarantined'], []),
      findings: privacyFindings,
      quarantined: true,
      publication: 'candidate-only',
    };
  }
  switch (format) {
    case 'schema-org-jsonld':
      return schemaOrgToEom(input, options);
    case 'icalendar':
      return calendarToEom(input, options, definitionValue);
    case 'json-feed-rss-atom':
      return feedToEom(input, options, definitionValue);
    case 'qti-xml':
    case 'common-cartridge-xml':
      return xmlMetadataToEom(format, input, options, definitionValue);
    case 'case-json':
      return caseToEom(input, options, definitionValue);
    case 'lti-public-json':
      return ltiToEom(input, options, definitionValue);
    case 'ceds-json':
    case 'ed-fi-json':
    case 'oneroster-json-csv':
      return genericPublicToEom(format, input, options, definitionValue);
  }
}

export function schemaOrgToEom(input: unknown, options: AdapterOptions = {}): AdapterResult {
  const definitionValue = definitions[0]!;
  const limitFindings = inspectInputLimits(input, options);
  if (limitFindings.length > 0) return limitedResult(definitionValue, limitFindings);
  const source = firstRecord(input);
  if (!source)
    return rejectedResult(
      'schema-org-jsonld',
      'Schema.org JSON-LD must contain an object or @graph object.',
    );
  const sourceType = firstString(source, ['@type', 'type']) ?? 'EducationalOrganization';
  const externalId = firstString(source, ['@id', 'id']);
  const id = resourceId(externalId, options, 'schema-org');
  const canonical = httpsValue(firstString(source, ['url', 'sameAs']), id);
  const course = sourceType.toLowerCase().includes('course');
  const candidate: Record<string, unknown> = course
    ? {
        type: 'course',
        id,
        ...(externalId && externalId !== id
          ? { externalIdentifier: { scheme: 'schema.org', value: externalId } }
          : {}),
        name: firstString(source, ['name', 'headline']) ?? 'Untitled course',
        ...(firstString(source, ['description'])
          ? { description: firstString(source, ['description']) }
          : {}),
        ...(firstString(source, ['courseCode'])
          ? { code: firstString(source, ['courseCode']) }
          : {}),
        ...(firstString(source, ['inLanguage'])
          ? { languages: [firstString(source, ['inLanguage'])] }
          : {}),
      }
    : {
        type: 'organization-profile',
        id,
        ...(externalId && externalId !== id
          ? { externalIdentifier: { scheme: 'schema.org', value: externalId } }
          : {}),
        canonical,
        name: firstString(source, ['name', 'headline']) ?? 'Untitled organization',
        organizationType: 'educational-organization',
        ...(firstString(source, ['description'])
          ? { description: firstString(source, ['description']) }
          : {}),
        ...(firstString(source, ['url']) ? { website: firstString(source, ['url']) } : {}),
      };
  const fields = Object.entries(candidate).filter(([key]) => !['type', 'id'].includes(key));
  return mappedResult(definitionValue, candidate, fields, options, {
    exact: fields.map(([key]) => key),
    approximate: sourceType === 'EducationalOrganization' ? [] : ['@type'],
    omitted: ['unallowlisted Schema.org properties', 'private operational data'],
    warnings:
      sourceType === 'EducationalOrganization'
        ? []
        : ['Schema.org type was normalized conservatively.'],
  });
}

export function exportInput(
  format: AdapterFormat,
  input: unknown,
  options: AdapterOptions = {},
): AdapterExportResult {
  switch (format) {
    case 'schema-org-jsonld':
      return eomToSchemaOrg(input, options);
    case 'ceds-json':
      return eomToCeds(input, options);
    case 'icalendar':
      return eomToCalendar(input, options);
    default:
      return rejectedExport(format, 'This preview adapter is import-only.');
  }
}

export function eomToSchemaOrg(input: unknown, options: AdapterOptions = {}): AdapterExportResult {
  const definitionValue = definitions.find((item) => item.format === 'schema-org-jsonld')!;
  const limitFindings = inspectInputLimits(input, options);
  if (limitFindings.length > 0) return limitedExportResult(definitionValue, limitFindings);
  const source = firstRecord(input);
  if (!source)
    return rejectedExport('schema-org-jsonld', 'EOM export input must contain an object.');
  const type = firstString(source, ['type']);
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
  const result: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    ...(firstString(source, ['id']) ? { '@id': firstString(source, ['id']) } : {}),
    ...(localizedForExport(source.name) ? { name: localizedForExport(source.name) } : {}),
    ...(localizedForExport(source.description)
      ? { description: localizedForExport(source.description) }
      : {}),
  };
  if (schemaType === 'Course') {
    addString(result, 'courseCode', firstString(source, ['code']));
    addString(result, 'educationalLevel', firstString(source, ['educationLevel', 'level']));
    addString(result, 'inLanguage', firstString(source, ['language', 'defaultLanguage']));
    const provider = exportEntityRef(source.provider);
    if (provider) result.provider = provider;
  } else if (schemaType === 'Event') {
    addString(result, 'startDate', firstString(source, ['start']));
    addString(result, 'endDate', firstString(source, ['end']));
    addString(result, 'url', firstString(source, ['url', 'canonical']));
    addString(result, 'location', firstString(source, ['location']));
  } else if (schemaType === 'EducationalOrganization') {
    addString(result, 'url', firstString(source, ['website', 'canonical']));
    addString(result, 'description', localizedForExport(source.description));
  } else {
    addString(result, 'url', firstString(source, ['url', 'canonical']));
  }
  const mappedFields = Object.keys(result).filter(
    (key) => !['@context', '@type', '@id'].includes(key),
  );
  return {
    adapterId: definitionValue.id,
    version: '1.0',
    document: asJsonObject(result),
    lossReport: loss(
      mappedFields,
      type === 'course' ? ['prerequisite logic', 'structured outcomes'] : [],
      ['private operational fields', 'unallowlisted EOM extensions'],
      ['Schema.org output is a projection; EOM remains the source of truth.'],
    ),
    findings: [],
    publication: 'preview-only',
  };
}

export function eomToCeds(input: unknown, options: AdapterOptions = {}): AdapterExportResult {
  const definitionValue = definitions.find((item) => item.format === 'ceds-json')!;
  const limitFindings = inspectInputLimits(input, options);
  if (limitFindings.length > 0) return limitedExportResult(definitionValue, limitFindings);
  const source = firstRecord(input);
  if (!source) return rejectedExport('ceds-json', 'EOM export input must contain an object.');
  const externalIdentifier = identifierValue(source);
  const document: Record<string, unknown> = {
    ...(externalIdentifier ? { organizationId: externalIdentifier } : {}),
    ...(stringFromLocalized(source.name) ? { name: stringFromLocalized(source.name) } : {}),
    ...(firstString(source, ['organizationType'])
      ? { organizationType: firstString(source, ['organizationType']) }
      : {}),
    ...(firstString(source, ['website', 'canonical'])
      ? { website: firstString(source, ['website', 'canonical']) }
      : {}),
    ...(firstString(source, ['code']) ? { courseCode: firstString(source, ['code']) } : {}),
    ...(stringFromLocalized(source.title)
      ? { courseTitle: stringFromLocalized(source.title) }
      : {}),
  };
  return {
    adapterId: definitionValue.id,
    version: '1.0',
    document: asJsonObject(document),
    lossReport: loss(
      Object.keys(document),
      ['localized values', 'EOM resource types without a CEDS counterpart'],
      ['person-level records', 'operational assignments', 'private extensions'],
      ['Only the CEDS-aligned public projection is emitted.'],
    ),
    findings: [],
    publication: 'preview-only',
  };
}

export function eomToCalendar(input: unknown, options: AdapterOptions = {}): AdapterExportResult {
  const definitionValue = definitions.find((item) => item.format === 'icalendar')!;
  const limitFindings = inspectInputLimits(input, options);
  if (limitFindings.length > 0) return limitedExportResult(definitionValue, limitFindings);
  const source = firstRecord(input);
  if (!source) return rejectedExport('icalendar', 'EOM export input must contain an object.');
  const uid = firstString(source, ['id']);
  const summary = stringFromLocalized(source.name) ?? stringFromLocalized(source.title);
  if (!uid || !summary)
    return rejectedExport('icalendar', 'EOM event export requires id and name/title.');
  const description = stringFromLocalized(source.description);
  const start = firstString(source, ['start']);
  const end = firstString(source, ['end']);
  const location = firstString(source, ['location']);
  const url = firstString(source, ['url', 'canonical']);
  const textValues = [uid, summary, description, location, url].filter(
    (value): value is string => value !== undefined,
  );
  if (textValues.some(hasIcsControlCharacters)) {
    return rejectedExport(
      'icalendar',
      'EOM event export contains unsupported control characters in text metadata.',
    );
  }
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//paper&slate//EOM preview adapter//EN',
    'BEGIN:VEVENT',
    `UID:${escapeIcs(uid)}`,
    `SUMMARY:${escapeIcs(summary)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escapeIcs(description)}`);
  if (start) lines.push(`DTSTART:${toIcsDate(start)}`);
  if (end) lines.push(`DTEND:${toIcsDate(end)}`);
  if (location) lines.push(`LOCATION:${escapeIcs(location)}`);
  if (url) lines.push(`URL:${escapeIcs(url)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return {
    adapterId: definitionValue.id,
    version: '1.0',
    document: lines.join('\r\n') + '\r\n',
    lossReport: loss(
      [
        'id',
        'name',
        ...(description ? ['description'] : []),
        ...(start ? ['start'] : []),
        ...(end ? ['end'] : []),
      ],
      ['timezone metadata', 'recurrence rules'],
      ['attendee contacts', 'private organizer data', 'unallowlisted extensions'],
      ['iCalendar output contains one public VEVENT and does not claim scheduling equivalence.'],
    ),
    findings: [],
    publication: 'preview-only',
  };
}

function hasIcsControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      (codePoint <= 8 ||
        codePoint === 11 ||
        codePoint === 12 ||
        (codePoint >= 14 && codePoint <= 31) ||
        codePoint === 127)
    ) {
      return true;
    }
  }
  return false;
}

export function oneRosterToEom(input: unknown, options: AdapterOptions = {}): AdapterResult {
  return mapInput('oneroster-json-csv', input, options);
}

function genericPublicToEom(
  format: AdapterFormat,
  input: unknown,
  options: AdapterOptions,
  definitionValue: AdapterDefinition,
): AdapterResult {
  const source = firstRecord(input);
  if (!source) return rejectedResult(format, 'The adapter input must contain a public object.');
  const externalId = firstString(source, [
    'id',
    '@id',
    'uri',
    'sourcedId',
    'educationOrganizationId',
    'organizationId',
    'identifier',
  ]);
  const id = resourceId(externalId, options, format);
  const name = firstString(source, [
    'name',
    'title',
    'courseTitle',
    'nameOfInstitution',
    'shortNameOfInstitution',
  ]);
  const description = firstString(source, ['description', 'summary']);
  const code = firstString(source, ['courseCode', 'identifier', 'classCode']);
  const candidate: Record<string, unknown> = {
    type:
      format === 'oneroster-json-csv' && firstString(source, ['type']) === 'class'
        ? 'course-offering'
        : 'mapped-record',
    id,
    ...(externalId && externalId !== id
      ? { externalIdentifier: { scheme: format, value: externalId } }
      : {}),
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
    ...(code ? { code } : {}),
    ...(firstString(source, ['website', 'webSite', 'url'])
      ? { website: firstString(source, ['website', 'webSite', 'url']) }
      : {}),
  };
  const fields = Object.entries(candidate).filter(([key]) => !['type', 'id'].includes(key));
  return mappedResult(definitionValue, candidate, fields, options, {
    exact: fields.map(([key]) => key),
    approximate: ['external identifier namespaces', 'source-specific type labels'],
    omitted: [
      'students',
      'enrollments',
      'grades',
      'attendance',
      'private staff assignments',
      'credentials',
    ],
    warnings: ['External identifiers remain claims and require owner review before promotion.'],
  });
}

function caseToEom(
  input: unknown,
  options: AdapterOptions,
  definitionValue: AdapterDefinition,
): AdapterResult {
  const source = firstRecord(input);
  if (!source) return rejectedResult('case-json', 'CASE input must contain an item object.');
  const externalId = firstString(source, ['uri', 'identifier']);
  const id = resourceId(externalId, options, 'case');
  const candidate: Record<string, unknown> = {
    type: 'standard-alignment',
    id,
    ...(externalId && externalId !== id
      ? { externalIdentifier: { scheme: 'case', value: externalId } }
      : {}),
    ...(firstString(source, ['fullStatement'])
      ? { label: firstString(source, ['fullStatement']) }
      : {}),
    ...(firstString(source, ['humanCodingScheme'])
      ? { code: firstString(source, ['humanCodingScheme']) }
      : {}),
    ...(firstString(source, ['CFDocumentURI'])
      ? { framework: firstString(source, ['CFDocumentURI']) }
      : {}),
  };
  const fields = Object.entries(candidate).filter(([key]) => !['type', 'id'].includes(key));
  return mappedResult(definitionValue, candidate, fields, options, {
    exact: ['id', ...fields.map(([key]) => key)],
    approximate: ['label'],
    omitted: ['assessment responses', 'answer keys'],
    warnings: [],
  });
}

function ltiToEom(
  input: unknown,
  options: AdapterOptions,
  definitionValue: AdapterDefinition,
): AdapterResult {
  const source = firstRecord(input);
  if (!source)
    return rejectedResult('lti-public-json', 'LTI public metadata must contain an object.');
  const externalId = firstString(source, ['id', 'url', 'documentation']);
  const id = resourceId(externalId, options, 'lti');
  const candidate: Record<string, unknown> = {
    type: 'service-reference',
    id,
    ...(externalId && externalId !== id
      ? { externalIdentifier: { scheme: 'lti', value: externalId } }
      : {}),
    ...(firstString(source, ['name', 'title'])
      ? { name: firstString(source, ['name', 'title']) }
      : {}),
    ...(firstString(source, ['description'])
      ? { description: firstString(source, ['description']) }
      : {}),
    ...(firstString(source, ['documentation', 'url'])
      ? { url: firstString(source, ['documentation', 'url']) }
      : {}),
  };
  const fields = Object.entries(candidate).filter(([key]) => !['type', 'id'].includes(key));
  return mappedResult(definitionValue, candidate, fields, options, {
    exact: fields.map(([key]) => key),
    approximate: [],
    omitted: ['client secrets', 'private keys', 'tokens', 'launch data', 'user identifiers'],
    warnings: [],
  });
}

function xmlMetadataToEom(
  format: 'qti-xml' | 'common-cartridge-xml',
  input: unknown,
  options: AdapterOptions,
  definitionValue: AdapterDefinition,
): AdapterResult {
  if (typeof input !== 'string')
    return rejectedResult(format, 'XML adapter input must be supplied as text.');
  const unsafe = inspectXmlSafety(input);
  if (unsafe.length > 0)
    return rejectedResult(
      format,
      'XML input was rejected by the active-content safety policy.',
      unsafe,
      true,
    );
  const externalId = xmlTag(input, 'identifier') ?? xmlTag(input, 'id');
  const id = resourceId(externalId, options, format);
  const title = xmlTag(input, 'title') ?? xmlTag(input, 'name');
  const description = xmlTag(input, 'description');
  const candidate = asJsonObject({
    type: 'external-resource',
    id,
    ...(externalId && externalId !== id
      ? { externalIdentifier: { scheme: format, value: externalId } }
      : {}),
    ...(title ? { name: title } : {}),
    ...(description ? { description } : {}),
    format,
    ...(xmlTag(input, 'version') ? { sourceVersion: xmlTag(input, 'version') } : {}),
  });
  const fields = Object.entries(candidate).filter(([key]) => !['type', 'id'].includes(key));
  return mappedResult(definitionValue, candidate, fields, options, {
    exact: ['id', ...fields.map(([key]) => key)],
    approximate: ['description'],
    omitted:
      format === 'qti-xml'
        ? ['answer keys', 'secure item bodies', 'candidate responses']
        : ['private course content', 'submissions', 'credentials'],
    warnings: ['XML is parsed as metadata only; no external package or link is fetched.'],
  });
}

function calendarToEom(
  input: unknown,
  options: AdapterOptions,
  definitionValue: AdapterDefinition,
): AdapterResult {
  if (typeof input !== 'string')
    return rejectedResult('icalendar', 'iCalendar input must be supplied as text.');
  const fields = parseCalendarEvent(input);
  if (!fields)
    return rejectedResult('icalendar', 'A public VEVENT with UID and SUMMARY is required.');
  const candidate = asJsonObject({
    type: 'event',
    id: resourceId(fields.uid, options, 'icalendar'),
    ...(isAbsoluteUri(fields.uid)
      ? {}
      : { externalIdentifier: { scheme: 'iCalendar:UID', value: fields.uid } }),
    name: fields.summary,
    ...(fields.description ? { description: fields.description } : {}),
    ...(fields.start ? { start: fields.start } : {}),
    ...(fields.end ? { end: fields.end } : {}),
    ...(fields.location ? { location: fields.location } : {}),
    ...(fields.url ? { url: fields.url } : {}),
  });
  const mapped = Object.entries(candidate).filter(([key]) => !['type', 'id'].includes(key));
  return mappedResult(definitionValue, candidate, mapped, options, {
    exact: [
      'id',
      'name',
      ...mapped
        .filter(([key]) => ['description', 'start', 'end', 'location', 'url'].includes(key))
        .map(([key]) => key),
    ],
    approximate: ['recurrence rules'],
    omitted: ['attendee contacts', 'private organizer data'],
    warnings: [],
  });
}

function feedToEom(
  input: unknown,
  options: AdapterOptions,
  definitionValue: AdapterDefinition,
): AdapterResult {
  let source: Record<string, unknown> | undefined;
  if (isJsonObject(input)) {
    source = input;
  } else if (typeof input === 'string') {
    const unsafe = inspectXmlSafety(input);
    if (unsafe.length > 0)
      return rejectedResult(
        'json-feed-rss-atom',
        'Feed XML was rejected by the active-content safety policy.',
        unsafe,
        true,
      );
    source = feedXmlRecord(input);
  }
  if (!source)
    return rejectedResult(
      'json-feed-rss-atom',
      'Feed input must contain a JSON Feed object or safe RSS/Atom text.',
    );
  const item = Array.isArray(source.items) ? firstRecord(source.items[0]) : source;
  const record = item ?? source;
  const id = firstString(record, ['id', 'guid', 'url', 'link']) ?? targetId(options, 'feed');
  const title = firstString(record, ['title', 'name']) ?? 'Untitled feed item';
  const candidate = asJsonObject({
    type: 'news-item',
    id: resourceId(id, options, 'json-feed-rss-atom'),
    ...(isAbsoluteUri(id) ? {} : { externalIdentifier: { scheme: 'feed', value: id } }),
    name: title,
    ...(firstString(record, ['content_text', 'summary', 'description'])
      ? { description: firstString(record, ['content_text', 'summary', 'description']) }
      : {}),
    ...(firstString(record, ['url', 'link']) ? { url: firstString(record, ['url', 'link']) } : {}),
    ...(firstString(record, ['date_published', 'published', 'updated'])
      ? { published: firstString(record, ['date_published', 'published', 'updated']) }
      : {}),
  });
  const mapped = Object.entries(candidate).filter(([key]) => !['type', 'id'].includes(key));
  return mappedResult(definitionValue, candidate, mapped, options, {
    exact: ['id', 'name', ...mapped.map(([key]) => key)],
    approximate: ['content_html'],
    omitted: ['executable enclosures', 'private author contact data'],
    warnings: ['Rich text is treated as untrusted text and is not executed.'],
  });
}

function mappedResult(
  definitionValue: AdapterDefinition,
  candidateValue: Record<string, unknown>,
  fields: readonly [string, unknown][],
  options: AdapterOptions,
  lossReport: Omit<AdapterLossReport, 'warnings'> & { readonly warnings: readonly string[] },
): AdapterResult {
  const candidate = asJsonObject(candidateValue);
  const resourceId =
    typeof candidate.id === 'string' ? candidate.id : targetId(options, definitionValue.format);
  const claims = fields.map(([key, value]) =>
    claimFor(definitionValue, resourceId, `/${escapePointer(key)}`, value, options),
  );
  return {
    adapterId: definitionValue.id,
    version: '1.0',
    candidate,
    claims,
    lossReport,
    findings: [],
    quarantined: false,
    publication: 'candidate-only',
  };
}

function claimFor(
  definitionValue: AdapterDefinition,
  resourceId: string,
  pointer: string,
  value: unknown,
  options: AdapterOptions,
): JsonObject {
  const sourceId = options.sourceId ?? defaultSourceId;
  const digest = createHash('sha256')
    .update(`${definitionValue.id}|${resourceId}|${pointer}|${canonicalUnknown(value)}`, 'utf8')
    .digest('hex')
    .slice(0, 24);
  return asJsonObject({
    type: 'claim-record',
    id: `${sourceId}/claim/${digest}`,
    target: { resourceId, pointer },
    proposedValue: asJsonValue(value),
    source: {
      sourceId,
      locator: { selector: `${definitionValue.format}:${pointer}` },
    },
    evidence: {
      observedAt: options.observedAt ?? defaultObservedAt,
    },
    method: {
      kind: 'mapping',
      transformation: `${definitionValue.format}/1.0 -> eom-authoring-candidate/1.0`,
    },
    confidence: 0.75,
    authorityClass: 'unknown',
    privacyClass: 'public-review-required',
    review: {
      state: 'pending',
      requiredOwner: 'publication-admin',
    },
  });
}

function inspectInputPrivacy(input: unknown): readonly Finding[] {
  const findings: Finding[] = [];
  walkKeys(input, '', findings, new WeakSet<object>());
  return findings;
}

function walkKeys(
  value: unknown,
  pointer: string,
  findings: Finding[],
  visited: WeakSet<object>,
): void {
  if (typeof value !== 'object' || value === null) return;
  if (visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkKeys(item, `${pointer}/${index}`, findings, visited));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPointer = `${pointer}/${escapePointer(key)}`;
    if (prohibitedInputKey.test(key)) {
      findings.push(
        finding(
          'EOM_ADAPTER_PRIVACY_QUARANTINE',
          'privacy',
          'Adapter input contains a prohibited public-data field.',
          {
            severity: 'error',
            pointer: childPointer,
            help: 'Quarantine the input and remove the prohibited field before mapping.',
          },
        ),
      );
      continue;
    }
    walkKeys(child, childPointer, findings, visited);
  }
}

function inspectXmlSafety(value: string): readonly Finding[] {
  if (/<!(?:DOCTYPE|ENTITY)\b|<script\b|\bon[a-z]+\s*=/iu.test(value)) {
    return [
      finding(
        'EOM_ADAPTER_ACTIVE_CONTENT_REJECTED',
        'security',
        'The imported markup contains a prohibited declaration or executable content.',
        {
          severity: 'error',
          help: 'Use a metadata-only, pre-redacted export without DTDs, entities, scripts, event handlers, or active embeds.',
        },
      ),
    ];
  }
  return [];
}

function parseCalendarEvent(value: string):
  | {
      uid: string;
      summary: string;
      description?: string;
      start?: string;
      end?: string;
      location?: string;
      url?: string;
    }
  | undefined {
  const unfolded = value.replace(/\r?\n[ \t]/gu, '').split(/\r?\n/u);
  if (
    !unfolded.some((line) => line === 'BEGIN:VCALENDAR') ||
    !unfolded.some((line) => line === 'BEGIN:VEVENT')
  )
    return undefined;
  const lines = unfolded.slice(
    unfolded.indexOf('BEGIN:VEVENT') + 1,
    unfolded.indexOf('END:VEVENT'),
  );
  const read = (name: string): string | undefined => {
    const line = lines.find(
      (entry) => entry.startsWith(`${name}:`) || entry.startsWith(`${name};`),
    );
    return line ? unescapeIcs(line.slice(line.indexOf(':') + 1)) : undefined;
  };
  const uid = read('UID');
  const summary = read('SUMMARY');
  if (!uid || !summary) return undefined;
  const description = read('DESCRIPTION');
  const startValue = read('DTSTART');
  const endValue = read('DTEND');
  const location = read('LOCATION');
  const url = read('URL');
  return {
    uid,
    summary,
    ...(description ? { description } : {}),
    ...(startValue ? { start: normalizeIcsDate(startValue) } : {}),
    ...(endValue ? { end: normalizeIcsDate(endValue) } : {}),
    ...(location ? { location } : {}),
    ...(url ? { url } : {}),
  };
}

function feedXmlRecord(value: string): Record<string, unknown> | undefined {
  const item = value.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/iu)?.[0] ?? value;
  const read = (names: readonly string[]): string | undefined => {
    for (const name of names) {
      const match = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'iu'));
      if (match?.[1]) return stripMarkup(match[1]);
    }
    return undefined;
  };
  const link = item.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/iu)?.[1] ?? read(['link']);
  return {
    ...(read(['guid', 'id']) ? { id: read(['guid', 'id']) } : {}),
    ...(read(['title']) ? { title: read(['title']) } : {}),
    ...(read(['description', 'summary', 'content'])
      ? { description: read(['description', 'summary', 'content']) }
      : {}),
    ...(link ? { link } : {}),
    ...(read(['pubDate', 'published', 'updated'])
      ? { published: read(['pubDate', 'published', 'updated']) }
      : {}),
  };
}

function xmlTag(value: string, tag: string): string | undefined {
  const match = value.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'iu'));
  return match?.[1] ? stripMarkup(match[1]) : undefined;
}

function stripMarkup(value: string): string {
  return value
    .replace(/<[^>]+>/gu, '')
    .replace(
      /&(?:amp|lt|gt|quot|apos);/gu,
      (entity) =>
        ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[entity] ??
        entity,
    )
    .trim();
}

function unescapeIcs(value: string): string {
  return value.replace(/\\([\\;,])/gu, '$1').replace(/\\n/giu, '\n');
}

function normalizeIcsDate(value: string): string {
  const trimmed = value.replace(/[^0-9TZ+-]/gu, '');
  const match = trimmed.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?(Z)?$/u);
  if (!match) return value;
  const [, year, month, day, hour = '00', minute = '00', second = '00', utc] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${utc ? 'Z' : ''}`;
}

function definition(
  format: AdapterFormat,
  sourceVersion: string,
  direction: AdapterDefinition['direction'],
  modules: readonly string[],
  publicFieldAllowlist: readonly string[],
): AdapterDefinition {
  return {
    id: `https://paperandslate.org/eom/mappings/${format}`,
    format,
    sourceVersion,
    direction,
    status: 'preview',
    modules,
    publicFieldAllowlist,
    certificationClaim: false,
  };
}

function rejectedResult(
  format: AdapterFormat,
  message: string,
  findings: readonly Finding[] = [],
  quarantined = false,
): AdapterResult {
  const definitionValue = definitions.find((item) => item.format === format);
  return {
    adapterId: definitionValue?.id ?? `https://paperandslate.org/eom/mappings/${format}`,
    version: '1.0',
    claims: [],
    lossReport: loss([], [], [message], []),
    findings:
      findings.length > 0
        ? findings
        : [finding('EOM_ADAPTER_INPUT_INVALID', 'syntax', message, { severity: 'error' })],
    quarantined,
    publication: 'candidate-only',
  };
}

function loss(
  exact: readonly string[],
  approximate: readonly string[],
  omitted: readonly string[],
  warnings: readonly string[],
): AdapterLossReport {
  return { exact, approximate, omitted, warnings };
}

function firstRecord(value: unknown): Record<string, unknown> | undefined {
  if (isJsonObject(value)) {
    if (Array.isArray(value['@graph'])) return firstRecord(value['@graph'][0]);
    return value;
  }
  if (Array.isArray(value)) return firstRecord(value[0]);
  return undefined;
}

function firstString(value: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
    if (Array.isArray(candidate)) {
      const first = candidate.find(
        (item): item is string => typeof item === 'string' && item.length > 0,
      );
      if (first) return first;
    }
    if (isJsonObject(candidate) && typeof candidate.name === 'string') return candidate.name;
  }
  return undefined;
}

function httpsValue(value: string | undefined, fallback: string): string {
  if (value?.startsWith('https://')) return value;
  if (fallback.startsWith('https://')) return fallback;
  return `https://paperandslate.org/eom/mapped/${hash(fallback)}`;
}

function rejectedExport(format: AdapterFormat, message: string): AdapterExportResult {
  const definitionValue = definitions.find((item) => item.format === format);
  return {
    adapterId: definitionValue?.id ?? `https://paperandslate.org/eom/mappings/${format}`,
    version: '1.0',
    document: {},
    lossReport: loss([], [], [message], []),
    findings: [
      finding('EOM_ADAPTER_EXPORT_UNAVAILABLE', 'quality', message, { severity: 'error' }),
    ],
    publication: 'preview-only',
  };
}

function limitedResult(
  definitionValue: AdapterDefinition,
  findings: readonly Finding[],
): AdapterResult {
  return {
    adapterId: definitionValue.id,
    version: '1.0',
    claims: [],
    lossReport: loss([], [], ['adapter input exceeded a safety limit'], []),
    findings,
    quarantined: true,
    publication: 'candidate-only',
  };
}

function limitedExportResult(
  definitionValue: AdapterDefinition,
  findings: readonly Finding[],
): AdapterExportResult {
  return {
    adapterId: definitionValue.id,
    version: '1.0',
    document: {},
    lossReport: loss([], [], ['adapter input exceeded a safety limit'], []),
    findings,
    publication: 'preview-only',
  };
}

function inspectInputLimits(input: unknown, options: AdapterOptions): readonly Finding[] {
  const maxBytes = boundedAdapterLimit(
    options.maxBytes,
    DEFAULT_ADAPTER_MAX_BYTES,
    HARD_ADAPTER_MAX_BYTES,
  );
  const maxDepth = boundedAdapterLimit(
    options.maxDepth,
    DEFAULT_ADAPTER_MAX_DEPTH,
    HARD_ADAPTER_MAX_DEPTH,
    true,
  );
  const maxItems = boundedAdapterLimit(
    options.maxItems,
    DEFAULT_ADAPTER_MAX_ITEMS,
    HARD_ADAPTER_MAX_ITEMS,
    true,
  );
  const maxNodes = boundedAdapterLimit(
    options.maxNodes,
    DEFAULT_ADAPTER_MAX_NODES,
    HARD_ADAPTER_MAX_NODES,
  );
  const findings: Finding[] = [];
  const pending: Array<{ value: unknown; depth: number; pointer: string }> = [
    { value: input, depth: 0, pointer: '' },
  ];
  const visited = new WeakSet<object>();
  let bytes = 0;
  let items = 0;
  let nodes = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current.depth > maxDepth) {
      findings.push(
        finding(
          'EOM_ADAPTER_DEPTH_LIMIT',
          'transport',
          `Adapter input exceeds the configured ${maxDepth}-level depth limit.`,
          { severity: 'error', pointer: current.pointer || '/' },
        ),
      );
      break;
    }
    const value = current.value;
    if (typeof value === 'string') {
      bytes += new TextEncoder().encode(value).byteLength;
    } else if (value !== null && typeof value === 'object') {
      if (visited.has(value)) {
        findings.push(
          finding(
            'EOM_ADAPTER_CYCLE',
            'syntax',
            'Adapter input must not contain cyclic object references.',
            { severity: 'error', pointer: current.pointer || '/' },
          ),
        );
        break;
      }
      visited.add(value);
      nodes += 1;
      if (nodes > maxNodes) {
        findings.push(
          finding(
            'EOM_ADAPTER_NODE_LIMIT',
            'transport',
            `Adapter input exceeds the configured ${maxNodes}-node limit.`,
            { severity: 'error', pointer: current.pointer || '/' },
          ),
        );
        break;
      }
      if (Array.isArray(value)) {
        items += value.length;
        if (items > maxItems) {
          findings.push(
            finding(
              'EOM_ADAPTER_ITEM_LIMIT',
              'transport',
              `Adapter input exceeds the configured ${maxItems}-item limit.`,
              { severity: 'error', pointer: current.pointer || '/' },
            ),
          );
          break;
        }
        for (let index = value.length - 1; index >= 0; index -= 1) {
          pending.push({
            value: value[index],
            depth: current.depth + 1,
            pointer: `${current.pointer}/${index}`,
          });
        }
      } else if (isJsonObject(value)) {
        const entries = Object.entries(value);
        items += entries.length;
        if (items > maxItems) {
          findings.push(
            finding(
              'EOM_ADAPTER_ITEM_LIMIT',
              'transport',
              `Adapter input exceeds the configured ${maxItems}-item limit.`,
              { severity: 'error', pointer: current.pointer || '/' },
            ),
          );
          break;
        }
        for (const [key, child] of entries.reverse()) {
          bytes += new TextEncoder().encode(key).byteLength;
          pending.push({
            value: child,
            depth: current.depth + 1,
            pointer: `${current.pointer}/${escapePointer(key)}`,
          });
        }
      } else {
        findings.push(
          finding(
            'EOM_ADAPTER_INPUT_INVALID',
            'syntax',
            'Adapter input must contain only JSON-compatible objects and arrays.',
            { severity: 'error', pointer: current.pointer || '/' },
          ),
        );
        break;
      }
    }
    if (bytes > maxBytes) {
      findings.push(
        finding(
          'EOM_ADAPTER_BYTES_LIMIT',
          'transport',
          `Adapter input exceeds the configured ${maxBytes}-byte limit.`,
          { severity: 'error', pointer: current.pointer || '/' },
        ),
      );
      break;
    }
  }
  return findings;
}

function boundedAdapterLimit(
  value: number | undefined,
  fallback: number,
  maximum: number,
  allowZero = false,
): number {
  if (!Number.isFinite(value) || value === undefined || (allowZero ? value < 0 : value <= 0)) {
    return fallback;
  }
  return Math.min(Math.floor(value), maximum);
}

function addString(target: Record<string, unknown>, key: string, value: unknown): void {
  if (typeof value === 'string' && value.length > 0) target[key] = value;
  if (isJsonObject(value)) target[key] = value;
}

function localizedForExport(value: unknown): JsonValue | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (!isJsonObject(value)) return undefined;
  const defaultLanguage = typeof value.default === 'string' ? value.default : undefined;
  const values = isJsonObject(value.values) ? value.values : undefined;
  if (!defaultLanguage || !values) return undefined;
  const translated = values[defaultLanguage];
  if (typeof translated !== 'string' || translated.length === 0) return undefined;
  return asJsonObject({ '@value': translated, '@language': defaultLanguage });
}

function stringFromLocalized(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (!isJsonObject(value)) return undefined;
  const defaultLanguage = typeof value.default === 'string' ? value.default : undefined;
  const values = isJsonObject(value.values) ? value.values : undefined;
  const translated = defaultLanguage && values ? values[defaultLanguage] : undefined;
  return typeof translated === 'string' && translated.length > 0 ? translated : undefined;
}

function exportEntityRef(value: unknown): JsonObject | undefined {
  if (typeof value === 'string' && isAbsoluteUri(value)) return asJsonObject({ '@id': value });
  if (!isJsonObject(value)) return undefined;
  const id = typeof value.id === 'string' && isAbsoluteUri(value.id) ? value.id : undefined;
  const name = localizedForExport(value.name);
  if (!id && !name) return undefined;
  return asJsonObject({ ...(id ? { '@id': id } : {}), ...(name ? { name } : {}) });
}

function identifierValue(source: Record<string, unknown>): string | undefined {
  const externalObject = isJsonObject(source.externalIdentifier)
    ? source.externalIdentifier
    : undefined;
  const external =
    (externalObject && typeof externalObject.value === 'string'
      ? externalObject.value
      : undefined) ?? firstString(source, ['externalIdentifier', 'organizationId']);
  if (external) return external;
  const identifiers = Array.isArray(source.identifiers) ? source.identifiers : [];
  const first = identifiers.find((item): item is Record<string, unknown> => isJsonObject(item));
  return first ? firstString(first, ['value']) : undefined;
}

function escapeIcs(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replace(/\r\n|\r|\n/gu, '\\n');
}

function toIcsDate(value: string): string {
  const parsed = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z)?$/u);
  if (!parsed) return value.replace(/[^0-9TZ]/gu, '');
  const [, year, month, day, hour, minute, second, utc] = parsed;
  return `${year}${month}${day}T${hour}${minute}${second}${utc ?? ''}`;
}

function targetId(options: AdapterOptions, format: string): string {
  return isAbsoluteUri(options.targetResourceId)
    ? options.targetResourceId
    : `https://paperandslate.org/eom/mapped/${format}/${hash(format + (options.sourceId ?? defaultSourceId))}`;
}

function resourceId(value: string | undefined, options: AdapterOptions, format: string): string {
  return isAbsoluteUri(value) ? value : targetId(options, format);
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 24);
}

function canonicalUnknown(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function asJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(asJsonValue);
  if (isJsonObject(value)) {
    const result: JsonObject = Object.create(null) as JsonObject;
    for (const [key, child] of Object.entries(value)) result[key] = asJsonValue(child);
    return result;
  }
  return null;
}

function asJsonObject(value: Record<string, unknown>): JsonObject {
  const result: JsonObject = Object.create(null) as JsonObject;
  for (const [key, child] of Object.entries(value)) result[key] = asJsonValue(child);
  return result;
}

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}
