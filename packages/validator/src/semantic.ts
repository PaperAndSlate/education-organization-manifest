import {
  isAbsoluteUri,
  isHttpsUri,
  isSameOrigin,
  normalizeOrigin,
  originOf,
} from '@paperandslate/eom-core/ids';
import { stringifyCanonical } from '@paperandslate/eom-core/json';
import type { Finding } from './findings.js';
import { finding } from './findings.js';

type UnknownRecord = Record<string, unknown>;

export interface SemanticOptions {
  readonly now?: Date;
}

export function semanticFindings(document: unknown, options: SemanticOptions = {}): Finding[] {
  if (!isRecord(document)) {
    return [
      finding('EOM_DOCUMENT_OBJECT_REQUIRED', 'semantic', 'The publication must be a JSON object.'),
    ];
  }
  const findings: Finding[] = [];
  const type = typeof document.type === 'string' ? document.type : undefined;
  if (type === 'manifest') {
    inspectManifest(document, findings, options.now ?? new Date());
  } else {
    inspectResource(document, findings, options.now ?? new Date());
    if (type === 'course-catalog') inspectCourseCatalog(document, findings);
    if (type === 'course-offering-catalog') inspectOfferingCatalog(document, findings);
    if (type === 'program-catalog') inspectProgramCatalog(document, findings);
  }
  return findings;
}

/**
 * Validate references that can only be resolved after all independently
 * addressable resources have been loaded. This deliberately remains a
 * publication-set operation; a consumer validating one resource must not
 * assume that an optional module exists locally.
 */
export function publicationSetFindings(
  documents: Readonly<Record<string, unknown>>,
  _options: SemanticOptions = {},
): Finding[] {
  const findings: Finding[] = [];
  const known = new Map<string, KnownEntity>();
  for (const [documentName, document] of Object.entries(documents)) {
    if (!isRecord(document)) continue;
    const documentId = stringValue(document.id);
    if (documentId) {
      const documentType = stringValue(document.type);
      const documentFingerprint = canonicalValueKey(document);
      const previous = known.get(documentId);
      const isIdenticalManifestAlias =
        documentType === 'manifest' &&
        previous?.type === 'manifest' &&
        previous.fingerprint !== undefined &&
        previous.fingerprint === documentFingerprint;
      if (previous && !isIdenticalManifestAlias) {
        findings.push(
          finding(
            'EOM_PUBLICATION_DUPLICATE_ID',
            'semantic',
            `The stable id ${documentId} is published more than once in the resource set.`,
            {
              pointer: `/${escapePointer(documentName)}/id`,
              related: [previous.documentName, previous.pointer],
              help: 'Keep one canonical definition for each stable public identifier.',
            },
          ),
        );
      } else {
        known.set(documentId, {
          documentName,
          pointer: `${documentName}/id`,
          ...(documentType ? { type: documentType } : {}),
          ...(documentFingerprint === undefined ? {} : { fingerprint: documentFingerprint }),
        });
      }
    }
    if (stringValue(document.type) === 'manifest') continue;
    const collection = collectionForDocument(document);
    const items = collection.items;
    items.forEach((item, index) => {
      if (!isRecord(item) || typeof item.id !== 'string') return;
      const previous = known.get(item.id);
      if (previous) {
        findings.push(
          finding(
            'EOM_PUBLICATION_DUPLICATE_ID',
            'semantic',
            `The stable id ${item.id} is published more than once in the resource set.`,
            {
              pointer: `/${escapePointer(documentName)}/${collection.field}/${index}/id`,
              related: [previous.documentName, previous.pointer],
              help: 'Keep one canonical definition for each stable public identifier.',
            },
          ),
        );
      } else {
        const entityType = stringValue(item.type);
        const itemFingerprint = canonicalValueKey(item);
        known.set(item.id, {
          documentName,
          pointer: `${documentName}/${collection.field}/${index}`,
          ...(entityType ? { type: entityType } : {}),
          ...(itemFingerprint === undefined ? {} : { fingerprint: itemFingerprint }),
        });
      }
    });
    items.forEach((item, itemIndex) => {
      if (!isRecord(item)) return;
      for (const [periodIndex, period] of arrayValue(item.periods).entries()) {
        if (!isRecord(period) || typeof period.id !== 'string') continue;
        if (!known.has(period.id)) {
          known.set(period.id, {
            documentName,
            pointer: `${documentName}/${collection.field}/${itemIndex}/periods/${periodIndex}`,
            type: 'academic-period',
          });
        }
      }
    });
  }

  for (const [documentName, document] of Object.entries(documents)) {
    if (!isRecord(document)) continue;
    const collection = collectionForDocument(document);
    const items = collection.items;
    const type = stringValue(document.type);
    items.forEach((item, index) => {
      if (!isRecord(item)) return;
      const pointer = `/${escapePointer(documentName)}/${collection.field}/${index}`;
      if (type === 'course-offering-catalog' && stringValue(item.type) === 'course-offering') {
        checkEntityReference(item.course, known, findings, `${pointer}/course`, ['course']);
        checkEntityReference(item.provider, known, findings, `${pointer}/provider`, [
          'organization-profile',
          'organization',
        ]);
        checkEntityReference(item.academicPeriod, known, findings, `${pointer}/academicPeriod`, [
          'academic-period',
        ]);
        checkOfferingSections(item, known, findings, pointer);
      }
      if (type === 'program-catalog' && stringValue(item.type) === 'program') {
        checkEntityReference(item.provider, known, findings, `${pointer}/provider`, [
          'organization-profile',
          'organization',
        ]);
        checkEntityReferenceArray(item.departments, known, findings, `${pointer}/departments`, [
          'department',
        ]);
        checkRequirementReferences(item.requirements, known, findings, `${pointer}/requirements`);
        checkRequirementReferences(
          item.electiveGroups,
          known,
          findings,
          `${pointer}/electiveGroups`,
        );
        checkStageReferences(item.stages, known, findings, `${pointer}/stages`);
      }
      if (type === 'course-catalog' && stringValue(item.type) === 'course') {
        checkEntityReference(item.provider, known, findings, `${pointer}/provider`, [
          'organization-profile',
          'organization',
        ]);
        checkEntityReference(item.department, known, findings, `${pointer}/department`, [
          'department',
        ]);
        checkEntityReferenceArray(item.programs, known, findings, `${pointer}/programs`, [
          'program',
        ]);
      }
      checkModuleItemReferences(type, item, known, findings, pointer);
    });
  }
  return findings;
}

interface DocumentCollection {
  readonly field: 'items' | 'contacts' | 'organizations';
  readonly items: readonly unknown[];
}

function collectionForDocument(document: UnknownRecord): DocumentCollection {
  if (Array.isArray(document.contacts)) return { field: 'contacts', items: document.contacts };
  if (Array.isArray(document.organizations)) {
    return { field: 'organizations', items: document.organizations };
  }
  return { field: 'items', items: arrayValue(document.items) };
}

function checkModuleItemReferences(
  documentType: string | undefined,
  item: UnknownRecord,
  known: ReadonlyMap<string, KnownEntity>,
  findings: Finding[],
  pointer: string,
): void {
  const references: Readonly<Record<string, readonly string[]>> =
    documentType === 'campus-catalog'
      ? {
          operator: ['organization-profile', 'organization'],
          organizationsServed: ['organization-profile', 'organization'],
        }
      : documentType === 'department-catalog'
        ? {
            parentOrganization: ['organization-profile', 'organization'],
            parentDepartment: ['department'],
            programs: ['program'],
            courses: ['course'],
            campuses: ['campus'],
            leadership: ['staff-member'],
          }
        : documentType === 'staff-directory'
          ? {
              departments: ['department'],
              publicCourses: ['course'],
              teams: ['sports-team'],
            }
          : documentType === 'contact-directory'
            ? {
                organization: ['organization-profile', 'organization'],
                department: ['department'],
              }
            : documentType === 'course-catalog'
              ? {
                  campuses: ['campus'],
                  locations: ['facility', 'campus'],
                }
              : documentType === 'course-offering-catalog'
                ? {
                    campuses: ['campus'],
                    locations: ['facility', 'campus'],
                    instructors: ['staff-member'],
                  }
                : documentType === 'program-catalog'
                  ? {
                      qualifications: ['qualification'],
                      certifications: ['certification'],
                      partnerOrganizations: ['organization-profile', 'organization'],
                      campuses: ['campus'],
                      contact: ['role-contact'],
                    }
                  : documentType === 'event-catalog'
                    ? { location: ['facility', 'campus'] }
                    : documentType === 'facility-catalog'
                      ? { campus: ['campus'] }
                      : documentType === 'service-catalog'
                        ? {
                            provider: ['organization-profile', 'organization'],
                            locations: ['facility', 'campus'],
                          }
                        : documentType === 'policy-catalog'
                          ? {
                              organization: ['organization-profile', 'organization'],
                              supersedes: ['policy'],
                              supersededBy: ['policy'],
                            }
                          : documentType === 'admissions-profile'
                            ? {
                                organization: ['organization-profile', 'organization'],
                                program: ['program'],
                              }
                            : documentType === 'sports-catalog'
                              ? {
                                  organization: ['organization-profile', 'organization'],
                                  homeFacilities: ['facility'],
                                  coaches: ['staff-member'],
                                  contact: ['role-contact'],
                                }
                              : documentType === 'transportation-catalog'
                                ? {
                                    provider: ['organization-profile', 'organization'],
                                    organizations: ['organization-profile', 'organization'],
                                    campuses: ['campus'],
                                  }
                                : documentType === 'meal-menu-catalog'
                                  ? { campus: ['campus'] }
                                  : documentType === 'club-catalog'
                                    ? {
                                        organization: ['organization-profile', 'organization'],
                                        department: ['department'],
                                        advisor: ['staff-member'],
                                        location: ['facility', 'campus'],
                                      }
                                    : documentType === 'job-catalog'
                                      ? {
                                          hiringOrganization: [
                                            'organization-profile',
                                            'organization',
                                          ],
                                          department: ['department'],
                                          location: ['facility', 'campus'],
                                          contact: ['role-contact'],
                                        }
                                      : documentType === 'news-feed'
                                        ? { author: ['staff-member', 'role-contact'] }
                                        : documentType === 'statistics-profile'
                                          ? { subject: ['organization-profile', 'organization'] }
                                          : documentType === 'api-reference'
                                            ? {
                                                provider: ['organization-profile', 'organization'],
                                              }
                                            : {};

  for (const [field, expectedTypes] of Object.entries(references)) {
    const value = item[field];
    if (Array.isArray(value)) {
      checkEntityReferenceArray(value, known, findings, `${pointer}/${field}`, expectedTypes);
    } else {
      checkEntityReference(value, known, findings, `${pointer}/${field}`, expectedTypes);
    }
  }
}

interface KnownEntity {
  readonly documentName: string;
  readonly pointer: string;
  readonly type?: string;
  readonly fingerprint?: string;
}

function canonicalValueKey(value: unknown): string | undefined {
  try {
    return stringifyCanonical(value as never);
  } catch {
    return undefined;
  }
}

function inspectCourseCatalog(document: UnknownRecord, findings: Finding[]): void {
  const items = arrayValue(document.items);
  const courseIds = new Set<string>();
  const graph = new Map<string, readonly string[]>();
  const codes = new Map<string, CourseCodeEntry[]>();

  for (const value of items) {
    if (isRecord(value) && stringValue(value.type) === 'course' && typeof value.id === 'string') {
      courseIds.add(value.id);
    }
  }

  items.forEach((value, index) => {
    if (!isRecord(value) || stringValue(value.type) !== 'course') return;
    const pointer = `/items/${index}`;
    const id = stringValue(value.id);
    if (id) courseIds.add(id);
    inspectPeriodValue(value.effective, findings, `${pointer}/effective`);
    if (isRecord(value.catalogVersion)) {
      inspectPeriodValue(
        value.catalogVersion.effective,
        findings,
        `${pointer}/catalogVersion/effective`,
      );
    }
    const prerequisites: string[] = [];
    collectPrerequisiteCourses(value.prerequisites, prerequisites);
    if (id) graph.set(id, prerequisites);
    const corequisites = arrayValue(value.corequisites)
      .map(entityRefId)
      .filter((ref): ref is string => ref !== undefined);
    for (const [refIndex, prerequisiteId] of prerequisites.entries()) {
      if (courseIds.has(prerequisiteId)) continue;
      findings.push(
        finding(
          'EOM_PREREQUISITE_UNKNOWN_COURSE',
          'semantic',
          'The prerequisite references a course that is not in this catalog.',
          {
            pointer: `${pointer}/prerequisites/${refIndex}`,
            related: [prerequisiteId],
            help: 'Publish the referenced course in the same catalog or remove the stale relationship.',
          },
        ),
      );
    }
    for (const [refIndex, corequisiteId] of corequisites.entries()) {
      if (courseIds.has(corequisiteId)) continue;
      findings.push(
        finding(
          'EOM_COREQUISITE_UNKNOWN_COURSE',
          'semantic',
          'The corequisite references a course that is not in this catalog.',
          {
            pointer: `${pointer}/corequisites/${refIndex}`,
            related: [corequisiteId],
            help: 'Publish the referenced course in the same catalog or remove the stale relationship.',
          },
        ),
      );
    }
    for (const field of ['replaces', 'replacedBy']) {
      const reference = entityRefId(value[field]);
      if (reference && !courseIds.has(reference)) {
        findings.push(
          finding(
            'EOM_COURSE_REPLACEMENT_UNKNOWN',
            'semantic',
            'A course replacement reference is not in the catalog.',
            {
              pointer: `${pointer}/${field}`,
              related: [reference],
              help: 'Retain historical course identifiers when publishing replacement relationships.',
            },
          ),
        );
      }
    }
    if (id && typeof value.code === 'string') {
      const catalogPeriod = isRecord(value.catalogVersion)
        ? value.catalogVersion.effective
        : undefined;
      const from = periodDate(value.effective, 'from') ?? periodDate(catalogPeriod, 'from');
      const until = periodDate(value.effective, 'until') ?? periodDate(catalogPeriod, 'until');
      const entry: CourseCodeEntry = {
        id,
        index,
        ...(from ? { from } : {}),
        ...(until ? { until } : {}),
      };
      const entries = codes.get(value.code) ?? [];
      for (const previous of entries) {
        if (previous.id !== entry.id && periodsOverlap(previous, entry)) {
          findings.push(
            finding(
              'EOM_COURSE_CODE_OVERLAP',
              'semantic',
              `Course code ${value.code} is reused during overlapping effective periods.`,
              {
                pointer: `${pointer}/code`,
                related: [`/items/${previous.index}/code`, previous.id],
                help: 'Use a distinct code or publish non-overlapping effective periods.',
              },
            ),
          );
        }
      }
      entries.push(entry);
      codes.set(value.code, entries);
    }
    inspectCourseOfferingLeak(value, findings, pointer);
  });

  for (const cycle of prerequisiteCycles(graph)) {
    const first = cycle[0];
    if (!first) continue;
    const index = courseIndex(items, first);
    findings.push(
      finding(
        'EOM_PREREQUISITE_CYCLE',
        'semantic',
        'Prerequisite relationships must form an acyclic graph.',
        {
          pointer: `/items/${index}/prerequisites`,
          related: cycle,
          help: 'Remove the circular requirement or replace one edge with a recommendation.',
        },
      ),
    );
  }
}

interface CourseCodeEntry {
  readonly id: string;
  readonly index: number;
  readonly from?: Date;
  readonly until?: Date;
}

function inspectOfferingCatalog(document: UnknownRecord, findings: Finding[]): void {
  for (const [index, value] of arrayValue(document.items).entries()) {
    if (!isRecord(value) || stringValue(value.type) !== 'course-offering') continue;
    const pointer = `/items/${index}`;
    inspectPeriodValue(value.applicationWindow, findings, `${pointer}/applicationWindow`);
    const start = periodDate(value, 'start');
    const end = periodDate(value, 'end');
    if (start && end && start > end) {
      findings.push(
        finding(
          'EOM_OFFERING_DATE_ORDER',
          'semantic',
          'An offering start date must be earlier than or equal to its end date.',
          {
            pointer: `${pointer}/end`,
          },
        ),
      );
    }
    for (const [sectionIndex, section] of arrayValue(value.sections).entries()) {
      if (!isRecord(section) || stringValue(section.type) !== 'course-section') continue;
      const sectionPointer = `${pointer}/sections/${sectionIndex}`;
      inspectPeriodValue({ from: section.start, until: section.end }, findings, sectionPointer);
    }
  }
}

function inspectProgramCatalog(document: UnknownRecord, findings: Finding[]): void {
  for (const [index, value] of arrayValue(document.items).entries()) {
    if (!isRecord(value) || stringValue(value.type) !== 'program') continue;
    const pointer = `/items/${index}`;
    inspectPeriodValue(value.effective, findings, `${pointer}/effective`);
    if (isRecord(value.catalogVersion)) {
      inspectPeriodValue(
        value.catalogVersion.effective,
        findings,
        `${pointer}/catalogVersion/effective`,
      );
    }
    const stageOrders = new Set<number>();
    for (const [stageIndex, stage] of arrayValue(value.stages).entries()) {
      if (!isRecord(stage) || typeof stage.order !== 'number') continue;
      if (stageOrders.has(stage.order)) {
        findings.push(
          finding(
            'EOM_PROGRAM_STAGE_ORDER_DUPLICATE',
            'semantic',
            'Program stage order values must be unique.',
            {
              pointer: `${pointer}/stages/${stageIndex}/order`,
            },
          ),
        );
      }
      stageOrders.add(stage.order);
    }
  }
}

function inspectCourseOfferingLeak(
  course: UnknownRecord,
  findings: Finding[],
  pointer: string,
): void {
  for (const field of [
    'schedule',
    'section',
    'sections',
    'availability',
    'start',
    'end',
    'academicPeriod',
    'applicationWindow',
    'instructor',
    'instructors',
    'capacity',
  ]) {
    if (course[field] !== undefined) {
      findings.push(
        finding(
          'EOM_COURSE_OFFERING_DATA_LEAK',
          'semantic',
          `Course definitions must not contain offering or section field ${field}.`,
          {
            pointer: `${pointer}/${escapePointer(field)}`,
            help: 'Move occurrence-specific schedule, instructor, capacity, and availability data to the offering or section resource.',
          },
        ),
      );
    }
  }
}

function collectPrerequisiteCourses(value: unknown, result: string[]): void {
  if (!isRecord(value)) return;
  const course = entityRefId(value.course);
  if (course) result.push(course);
  for (const key of ['allOf', 'oneOf', 'anyOf']) {
    for (const child of arrayValue(value[key])) collectPrerequisiteCourses(child, result);
  }
}

function prerequisiteCycles(graph: ReadonlyMap<string, readonly string[]>): readonly string[][] {
  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const walk = (node: string): void => {
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      if (start >= 0) cycles.push([...stack.slice(start), node]);
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    stack.push(node);
    for (const prerequisite of graph.get(node) ?? []) walk(prerequisite);
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  };
  for (const node of graph.keys()) walk(node);
  return cycles;
}

function courseIndex(items: readonly unknown[], id: string): number {
  const index = items.findIndex((item) => isRecord(item) && item.id === id);
  return index >= 0 ? index : 0;
}

function periodsOverlap(left: CourseCodeEntry, right: CourseCodeEntry): boolean {
  const leftFrom = left.from?.getTime() ?? Number.NEGATIVE_INFINITY;
  const leftUntil = left.until?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightFrom = right.from?.getTime() ?? Number.NEGATIVE_INFINITY;
  const rightUntil = right.until?.getTime() ?? Number.POSITIVE_INFINITY;
  return leftFrom <= rightUntil && rightFrom <= leftUntil;
}

function inspectPeriodValue(value: unknown, findings: Finding[], pointer: string): void {
  if (!isRecord(value)) return;
  const from = periodDate(value, 'from');
  const until = periodDate(value, 'until');
  if (from && until && from > until) {
    findings.push(
      finding(
        'EOM_PERIOD_ORDER',
        'semantic',
        'An effective period must start before or on its end.',
        {
          pointer,
        },
      ),
    );
  }
}

function periodDate(value: unknown, field: string): Date | undefined {
  if (!isRecord(value)) return undefined;
  return parseDate(value[field]);
}

function entityRefId(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  return isRecord(value) && typeof value.id === 'string' ? value.id : undefined;
}

function checkEntityReference(
  value: unknown,
  known: ReadonlyMap<string, KnownEntity>,
  findings: Finding[],
  pointer: string,
  expectedTypes: readonly string[] = [],
): void {
  const id = entityRefId(value);
  if (!id) return;
  const target = known.get(id);
  if (!target) {
    findings.push(
      finding(
        'EOM_REFERENCE_DANGLING',
        'semantic',
        'A public entity reference does not resolve in the publication set.',
        {
          pointer,
          related: [id],
          help: 'Publish the referenced entity or remove the stale reference.',
        },
      ),
    );
    return;
  }
  if (expectedTypes.length > 0 && target.type && !expectedTypes.includes(target.type)) {
    findings.push(
      finding(
        'EOM_REFERENCE_TYPE_MISMATCH',
        'semantic',
        'A public entity reference resolves to an unexpected resource type.',
        {
          pointer,
          related: [id, target.type],
          help: `Reference an entity of type ${expectedTypes.join(' or ')}.`,
        },
      ),
    );
  }
}

function checkEntityReferenceArray(
  value: unknown,
  known: ReadonlyMap<string, KnownEntity>,
  findings: Finding[],
  pointer: string,
  expectedTypes: readonly string[] = [],
): void {
  for (const [index, item] of arrayValue(value).entries()) {
    checkEntityReference(item, known, findings, `${pointer}/${index}`, expectedTypes);
  }
}

function checkRequirementReferences(
  value: unknown,
  known: ReadonlyMap<string, KnownEntity>,
  findings: Finding[],
  pointer: string,
): void {
  for (const [index, group] of arrayValue(value).entries()) {
    if (!isRecord(group)) continue;
    checkEntityReferenceArray(group.courses, known, findings, `${pointer}/${index}/courses`, [
      'course',
    ]);
    checkRequirementReferences(
      group.requirements,
      known,
      findings,
      `${pointer}/${index}/requirements`,
    );
    checkEntityReference(
      group.externalCredential,
      known,
      findings,
      `${pointer}/${index}/externalCredential`,
    );
  }
}

function checkStageReferences(
  value: unknown,
  known: ReadonlyMap<string, KnownEntity>,
  findings: Finding[],
  pointer: string,
): void {
  for (const [index, stage] of arrayValue(value).entries()) {
    if (!isRecord(stage)) continue;
    checkEntityReferenceArray(stage.courses, known, findings, `${pointer}/${index}/courses`, [
      'course',
    ]);
    if (isRecord(stage.choose)) {
      checkRequirementReferences([stage.choose], known, findings, `${pointer}/${index}/choose`);
    }
  }
}

function checkOfferingSections(
  offering: UnknownRecord,
  known: ReadonlyMap<string, KnownEntity>,
  findings: Finding[],
  pointer: string,
): void {
  for (const [index, section] of arrayValue(offering.sections).entries()) {
    if (!isRecord(section) || stringValue(section.type) !== 'course-section') continue;
    const sectionPointer = `${pointer}/sections/${index}`;
    checkEntityReference(section.offering, known, findings, `${sectionPointer}/offering`, [
      'course-offering',
    ]);
    checkEntityReference(section.location, known, findings, `${sectionPointer}/location`, [
      'facility',
      'campus',
    ]);
    checkEntityReference(section.instructor, known, findings, `${sectionPointer}/instructor`, [
      'staff-member',
    ]);
  }
}

function inspectManifest(document: UnknownRecord, findings: Finding[], now: Date): void {
  const canonical = stringValue(document.canonical);
  const scope = isRecord(document.scope) ? document.scope : undefined;
  const scopeOrigin = scope ? stringValue(scope.origin) : undefined;
  if (canonical && stringValue(document.id) !== canonical) {
    findings.push(
      finding(
        'EOM_MANIFEST_ID_CANONICAL_MISMATCH',
        'semantic',
        'The root manifest id must equal its canonical URL.',
        {
          pointer: '/id',
          related: [canonical],
          help: 'Use the canonical HTTPS discovery URL for both id and canonical.',
        },
      ),
    );
  }
  if (canonical && scopeOrigin && !isSameOrigin(canonical, scopeOrigin)) {
    findings.push(
      finding(
        'EOM_SCOPE_CANONICAL_ORIGIN',
        'semantic',
        'The manifest canonical URL must be on its declared scope origin.',
        {
          pointer: '/canonical',
          related: [scopeOrigin],
          help: 'Use an explicit authorized redirect/delegation when publication crosses origins.',
        },
      ),
    );
  }
  inspectLanguageDefaults(document, findings, '');
  inspectUniqueIds(arrayValue(document.organizations), findings, '/organizations');
  inspectUniqueIds(arrayValue(document.capabilities), findings, '/capabilities');
  inspectUniqueIds(arrayValue(document.resources), findings, '/resources');
  inspectUniqueIds(arrayValue(document.delegations), findings, '/delegations');

  const organizations = new Set(
    arrayValue(document.organizations)
      .map((item) => (isRecord(item) ? stringValue(item.id) : undefined))
      .filter((value): value is string => value !== undefined),
  );
  const resources = new Map<string, UnknownRecord>();
  for (const resource of arrayValue(document.resources)) {
    if (isRecord(resource) && typeof resource.id === 'string') {
      resources.set(resource.id, resource);
      inspectResource(resource, findings, now);
      const href = stringValue(resource.href);
      if (
        href &&
        scopeOrigin &&
        !isSameOrigin(href, scopeOrigin) &&
        !hasDelegationFor(resource, document, now)
      ) {
        findings.push(
          finding(
            'EOM_RESOURCE_CROSS_ORIGIN_UNAUTHORIZED',
            'semantic',
            'A cross-origin resource must be explicitly delegated by the root.',
            {
              pointer: `/resources/${arrayValue(document.resources).indexOf(resource)}/href`,
              related: [scopeOrigin, href],
              help: 'Add an active delegation that covers the resource origin and type/id.',
            },
          ),
        );
      }
      const subjects = arrayValue(resource.subjects)
        .map(stringValue)
        .filter((value): value is string => value !== undefined);
      for (const subject of subjects) {
        if (organizations.size > 0 && !organizations.has(subject)) {
          findings.push(
            finding(
              'EOM_RESOURCE_UNKNOWN_SUBJECT',
              'semantic',
              'A resource subject must identify an organization represented by the root.',
              {
                pointer: `/resources/${arrayValue(document.resources).indexOf(resource)}/subjects`,
                related: [subject],
                help: 'Add the organization to the root or publish the resource under the correct manifest.',
              },
            ),
          );
        }
      }
    }
  }

  for (const capability of arrayValue(document.capabilities)) {
    if (!isRecord(capability)) continue;
    for (const reference of arrayValue(capability.resources)) {
      const id = stringValue(reference);
      if (id && !resources.has(id)) {
        findings.push(
          finding(
            'EOM_CAPABILITY_UNKNOWN_RESOURCE',
            'semantic',
            'A capability references a resource that is not listed by the root.',
            {
              pointer: '/capabilities',
              related: [id],
              help: 'List the resource descriptor or remove the stale capability reference.',
            },
          ),
        );
      }
    }
  }
  inspectFreshness(document, findings, now, '');
}

function inspectResource(document: UnknownRecord, findings: Finding[], now: Date): void {
  inspectLanguageDefaults(document, findings, '');
  inspectFreshness(document, findings, now, '');
  inspectPeriodValue(document.effective, findings, '/effective');
  inspectModuleItems(document, findings);
  inspectUniqueIds(arrayValue(document.provenance), findings, '/provenance');
  const id = stringValue(document.id);
  if (id && !isAbsoluteUri(id)) {
    findings.push(
      finding(
        'EOM_ID_ABSOLUTE_REQUIRED',
        'semantic',
        'Reusable resource identifiers must be absolute URIs.',
        { pointer: '/id' },
      ),
    );
  }
  const canonical = stringValue(document.canonical);
  if (canonical && !isHttpsUri(canonical)) {
    findings.push(
      finding(
        'EOM_CANONICAL_HTTPS_REQUIRED',
        'semantic',
        'Canonical publication URLs must use HTTPS.',
        { pointer: '/canonical' },
      ),
    );
  }
}

function inspectModuleItems(document: UnknownRecord, findings: Finding[]): void {
  const documentType = stringValue(document.type);
  const collection = collectionForDocument(document);
  const items = collection.items;
  items.forEach((value, index) => {
    if (!isRecord(value)) return;
    const pointer = `/${collection.field}/${index}`;
    if (documentType !== 'course-catalog' && documentType !== 'program-catalog') {
      inspectPeriodValue(value.effective, findings, `${pointer}/effective`);
    }
    if (documentType === 'academic-calendar') {
      inspectDateOrder(value, 'start', 'end', findings, `${pointer}`, 'EOM_CALENDAR_DATE_ORDER');
      for (const [periodIndex, period] of arrayValue(value.periods).entries()) {
        if (isRecord(period)) {
          inspectDateOrder(
            period,
            'start',
            'end',
            findings,
            `${pointer}/periods/${periodIndex}`,
            'EOM_ACADEMIC_PERIOD_DATE_ORDER',
          );
        }
      }
    }
    if (documentType === 'event-catalog') {
      inspectDateOrder(value, 'start', 'end', findings, pointer, 'EOM_EVENT_DATE_ORDER');
    }
    if (documentType === 'job-catalog') {
      inspectDateOrder(value, 'postedAt', 'closingAt', findings, pointer, 'EOM_JOB_DATE_ORDER');
    }
    if (documentType === 'news-feed') {
      inspectDateOrder(
        value,
        'publishedAt',
        'modifiedAt',
        findings,
        pointer,
        'EOM_NEWS_DATE_ORDER',
      );
    }
    if (documentType === 'statistics-profile') {
      inspectDateOrder(
        value,
        'observedAt',
        'publishedAt',
        findings,
        pointer,
        'EOM_STATISTIC_PUBLICATION_ORDER',
      );
      const suppression = isRecord(value.suppression) ? value.suppression : undefined;
      if (suppression?.suppressed === false && typeof suppression.suppressionReason === 'string') {
        findings.push(
          finding(
            'EOM_STATISTIC_SUPPRESSION_METADATA',
            'semantic',
            'A non-suppressed statistic must not carry a suppression reason.',
            {
              pointer: `${pointer}/suppression/suppressionReason`,
              help: 'Remove suppression metadata or set suppressed to true before publication.',
            },
          ),
        );
      }
    }
    if (documentType === 'admissions-profile') {
      inspectDateRanges(value.applicationWindows, findings, `${pointer}/applicationWindows`);
    }
    if (documentType === 'staff-directory') {
      const review = isRecord(value.publicationReview) ? value.publicationReview : undefined;
      if (review) {
        inspectDateOrder(
          review,
          'reviewedAt',
          'expires',
          findings,
          `${pointer}/publicationReview`,
          'EOM_PUBLICATION_REVIEW_ORDER',
        );
      }
    }
  });
}

function inspectDateRanges(value: unknown, findings: Finding[], pointer: string): void {
  for (const [index, range] of arrayValue(value).entries()) {
    if (isRecord(range)) inspectPeriodValue(range, findings, `${pointer}/${index}`);
  }
}

function inspectDateOrder(
  value: UnknownRecord,
  startField: string,
  endField: string,
  findings: Finding[],
  pointer: string,
  code: string,
): void {
  const start = parseDate(value[startField]);
  const end = parseDate(value[endField]);
  if (!start || !end || start <= end) return;
  findings.push(
    finding(code, 'semantic', `${startField} must be earlier than or equal to ${endField}.`, {
      pointer: `${pointer}/${endField}`,
      help: `Correct the ${startField}/${endField} range before publication.`,
    }),
  );
}

function inspectLanguageDefaults(
  document: UnknownRecord,
  findings: Finding[],
  pointer: string,
): void {
  const defaultLanguage = stringValue(document.defaultLanguage);
  const supported = arrayValue(document.supportedLanguages)
    .map(stringValue)
    .filter((value): value is string => value !== undefined);
  if (defaultLanguage && supported.length > 0 && !supported.includes(defaultLanguage)) {
    findings.push(
      finding(
        'EOM_DEFAULT_LANGUAGE_UNSUPPORTED',
        'semantic',
        'defaultLanguage must be included in supportedLanguages.',
        {
          pointer: `${pointer}/defaultLanguage`,
          related: supported,
        },
      ),
    );
  }
  for (const key of ['name', 'description', 'title', 'statement', 'role', 'message']) {
    const value = document[key];
    if (
      isRecord(value) &&
      typeof value.default === 'string' &&
      supported.length > 0 &&
      !supported.includes(value.default)
    ) {
      findings.push(
        finding(
          'EOM_LOCALIZED_DEFAULT_UNSUPPORTED',
          'semantic',
          `Localized field ${key} uses a language outside supportedLanguages.`,
          {
            pointer: `${pointer}/${escapePointer(key)}/default`,
            related: supported,
          },
        ),
      );
    }
  }
}

function inspectFreshness(
  document: UnknownRecord,
  findings: Finding[],
  now: Date,
  pointer: string,
): void {
  const modified = parseDate(document.modified);
  const expires = parseDate(document.expires);
  if (modified && expires && modified > expires) {
    findings.push(
      finding(
        'EOM_FRESHNESS_ORDER',
        'semantic',
        'modified must be earlier than or equal to expires.',
        {
          pointer: `${pointer}/expires`,
        },
      ),
    );
  }
  if (expires && expires < now) {
    findings.push(
      finding(
        'EOM_PUBLICATION_EXPIRED',
        'freshness',
        'The publication has passed its declared expiry.',
        {
          pointer: `${pointer}/expires`,
          severity: 'warning',
          help: 'Refresh expires or publish a new immutable snapshot.',
        },
      ),
    );
  }
}

function hasDelegationFor(resource: UnknownRecord, manifest: UnknownRecord, now: Date): boolean {
  const href = stringValue(resource.href);
  const hrefOrigin = href ? originOf(href) : undefined;
  const type = stringValue(resource.type);
  const id = stringValue(resource.id);
  return arrayValue(manifest.delegations).some((item) => {
    if (!isRecord(item) || item.status !== 'active' || item.transitive !== false) return false;
    const validFrom = parseDate(item.validFrom);
    const validUntil = parseDate(item.validUntil);
    const revokedAt = parseDate(item.revokedAt);
    if (validFrom && validFrom > now) return false;
    if (validUntil && validUntil < now) return false;
    if (revokedAt && revokedAt <= now) return false;
    const delegate =
      typeof item.delegate === 'string'
        ? originOf(item.delegate)
        : isRecord(item.delegate)
          ? originOf(stringValue(item.delegate.website) ?? stringValue(item.delegate.id) ?? '')
          : undefined;
    if (!delegate || !hrefOrigin || normalizeOrigin(delegate) !== normalizeOrigin(hrefOrigin)) {
      return false;
    }
    const scope = isRecord(item.scope) ? item.scope : undefined;
    const types = scope
      ? arrayValue(scope.resourceTypes)
          .map(stringValue)
          .filter((value): value is string => value !== undefined)
      : [];
    const ids = scope
      ? arrayValue(scope.resourceIds)
          .map(stringValue)
          .filter((value): value is string => value !== undefined)
      : [];
    const origins = scope
      ? arrayValue(scope.allowedOrigins)
          .map(stringValue)
          .filter((value): value is string => value !== undefined)
      : [];
    return (
      (!types.length || (type !== undefined && types.includes(type))) &&
      (!ids.length || (id !== undefined && ids.includes(id))) &&
      (!origins.length ||
        (hrefOrigin !== undefined &&
          origins.some((origin) => normalizeOrigin(origin) === normalizeOrigin(hrefOrigin)))) &&
      (!scope || isPathWithinDelegation(href, arrayValue(scope.allowedPathPrefixes)))
    );
  });
}

function isPathWithinDelegation(href: string | undefined, prefixes: readonly unknown[]): boolean {
  if (!href || prefixes.length === 0) return true;
  try {
    const pathname = new URL(href).pathname;
    return prefixes.some((value) => {
      if (typeof value !== 'string' || !value.startsWith('/')) return false;
      const prefix = value.endsWith('/') ? value : `${value}/`;
      return pathname === value || pathname.startsWith(prefix);
    });
  } catch {
    return false;
  }
}

function inspectUniqueIds(items: readonly unknown[], findings: Finding[], pointer: string): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const id = isRecord(item) ? stringValue(item.id) : undefined;
    if (!id) return;
    if (seen.has(id)) {
      findings.push(
        finding('EOM_DUPLICATE_ID', 'semantic', `Duplicate id ${id} in collection.`, {
          pointer: `${pointer}/${index}/id`,
          related: [id],
          help: 'Each reusable object must have one unique canonical identifier.',
        }),
      );
    }
    seen.add(id);
  });
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function arrayValue(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}
