import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, extname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { parseDocument } from 'yaml';
import { assertApprovedSourcePath, CandidatePolicyError } from '@paperandslate/eom-agentic';
import type { EomConfig } from '@paperandslate/eom-config';
import {
  isJsonObject,
  parseStrictJson,
  stableJsonValue,
  stringifyCanonical,
  type JsonObject,
  type JsonValue,
} from '@paperandslate/eom-core';
import { lintPublication } from '@paperandslate/eom-linter';
import {
  publicationSetFindings,
  validateDocument,
  type Finding,
} from '@paperandslate/eom-validator';

const SPECIFICATION = 'https://paperandslate.org/spec/eom/1.0';
const MANIFEST_SCHEMA = 'https://paperandslate.org/schemas/eom/1.0/manifest.schema.json';
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const DEFAULT_OUTPUT_MAX_BYTES = 256 * 1024;
const GENERATED_MARKER = '.eom-generated.json';

export interface BuildOptions {
  readonly configFile: string;
  readonly outputRoot?: string;
  readonly dryRun?: boolean;
  readonly now?: Date;
  /** Build only the selected registered module plus its organization dependency. */
  readonly module?: string;
  /** Require the selected organization identifier when authoring a multi-organization source. */
  readonly organization?: string;
  /** Use the injected/fixed clock and reject ambient-time output behavior. */
  readonly deterministic?: boolean;
  /** Allow a deliberately selected output outside the project directory. */
  readonly allowExternalOutput?: boolean;
}

export interface BuildInput {
  readonly path: string;
  readonly relativePath: string;
  readonly module: string;
  readonly sha256: string;
}

export interface BuildResource {
  readonly type: string;
  readonly canonical: string;
  readonly path: string;
  readonly itemCount: number;
  readonly sourceFiles: readonly string[];
}

export interface BuildReport {
  readonly toolVersion: string;
  readonly specification: string;
  readonly valid: boolean;
  readonly written: boolean;
  readonly dryRun: boolean;
  readonly outputRoot: string;
  readonly inputs: readonly BuildInput[];
  readonly resources: readonly BuildResource[];
  readonly findings: readonly Finding[];
  readonly sourceMap: Readonly<Record<string, readonly string[]>>;
  readonly fingerprint?: string;
  readonly partial?: {
    readonly module?: string;
    readonly organization?: string;
  };
}

export class GeneratorInputError extends Error {
  public constructor(
    message: string,
    public readonly findings: readonly Finding[] = [],
  ) {
    super(message);
    this.name = 'GeneratorInputError';
  }
}

interface ModuleDefinition {
  readonly key: string;
  readonly aliases: readonly string[];
  readonly resourceType: string;
  readonly itemType?: string;
  readonly fileName: string;
}

interface ParsedSource {
  readonly module: ModuleDefinition;
  readonly file: string;
  readonly relativePath: string;
  readonly value: unknown;
  readonly digest: string;
}

interface ModuleBuild {
  readonly documents: Readonly<Record<string, JsonObject>>;
  readonly sourceMap: Readonly<Record<string, readonly string[]>>;
  readonly organizationId: string;
}

const MODULES: readonly ModuleDefinition[] = [
  {
    key: 'organization',
    aliases: ['organization', 'organizations', 'profile'],
    resourceType: 'organization-profile',
    fileName: 'organization.json',
  },
  {
    key: 'contacts',
    aliases: ['contacts', 'contact', 'contactdirectory'],
    resourceType: 'contact-directory',
    fileName: 'contacts.json',
  },
  {
    key: 'campuses',
    aliases: ['campuses', 'campus'],
    resourceType: 'campus-catalog',
    itemType: 'campus',
    fileName: 'campuses.json',
  },
  {
    key: 'departments',
    aliases: ['departments', 'department'],
    resourceType: 'department-catalog',
    itemType: 'department',
    fileName: 'departments.json',
  },
  {
    key: 'staff',
    aliases: ['staff', 'staffdirectory'],
    resourceType: 'staff-directory',
    itemType: 'staff-member',
    fileName: 'staff.json',
  },
  {
    key: 'courses',
    aliases: ['courses', 'course'],
    resourceType: 'course-catalog',
    itemType: 'course',
    fileName: 'courses.json',
  },
  {
    key: 'offerings',
    aliases: ['offerings', 'offering', 'sections'],
    resourceType: 'course-offering-catalog',
    itemType: 'course-offering',
    fileName: 'offerings.json',
  },
  {
    key: 'programs',
    aliases: ['programs', 'program', 'pathways'],
    resourceType: 'program-catalog',
    itemType: 'program',
    fileName: 'programs.json',
  },
  {
    key: 'calendar',
    aliases: ['calendar', 'calendars', 'academiccalendar'],
    resourceType: 'academic-calendar',
    itemType: 'academic-calendar',
    fileName: 'calendar.json',
  },
  {
    key: 'events',
    aliases: ['events', 'event'],
    resourceType: 'event-catalog',
    itemType: 'event',
    fileName: 'events.json',
  },
  {
    key: 'facilities',
    aliases: ['facilities', 'facility'],
    resourceType: 'facility-catalog',
    itemType: 'facility',
    fileName: 'facilities.json',
  },
  {
    key: 'services',
    aliases: ['services', 'service'],
    resourceType: 'service-catalog',
    itemType: 'service',
    fileName: 'services.json',
  },
  {
    key: 'policies',
    aliases: ['policies', 'policy', 'documents'],
    resourceType: 'policy-catalog',
    itemType: 'policy-document',
    fileName: 'policies.json',
  },
  {
    key: 'admissions',
    aliases: ['admissions', 'admission'],
    resourceType: 'admissions-profile',
    itemType: 'admissions-profile',
    fileName: 'admissions.json',
  },
  {
    key: 'sports',
    aliases: ['sports', 'sport', 'athletics'],
    resourceType: 'sports-catalog',
    itemType: 'sports-team',
    fileName: 'sports.json',
  },
  {
    key: 'transportation',
    aliases: ['transportation', 'transport', 'routes'],
    resourceType: 'transportation-catalog',
    itemType: 'transport-service',
    fileName: 'transportation.json',
  },
  {
    key: 'meals',
    aliases: ['meals', 'meal', 'menus', 'menues'],
    resourceType: 'meal-menu-catalog',
    itemType: 'meal-menu',
    fileName: 'meals.json',
  },
  {
    key: 'clubs',
    aliases: ['clubs', 'club', 'activities'],
    resourceType: 'club-catalog',
    itemType: 'club',
    fileName: 'clubs.json',
  },
  {
    key: 'jobs',
    aliases: ['jobs', 'job', 'opportunities'],
    resourceType: 'job-catalog',
    itemType: 'job-posting',
    fileName: 'jobs.json',
  },
  {
    key: 'news',
    aliases: ['news', 'articles', 'announcements'],
    resourceType: 'news-feed',
    itemType: 'news-item',
    fileName: 'news.json',
  },
  {
    key: 'statistics',
    aliases: ['statistics', 'statistic', 'stats'],
    resourceType: 'statistics-profile',
    itemType: 'statistic',
    fileName: 'statistics.json',
  },
  {
    key: 'apis',
    aliases: ['apis', 'api', 'apiservices', 'servicesdiscovery'],
    resourceType: 'api-reference',
    itemType: 'api-reference',
    fileName: 'apis.json',
  },
];

export function moduleDefinition(key: string): ModuleDefinition | undefined {
  const normalized = normalizeKey(key);
  return MODULES.find(
    (module) =>
      normalizeKey(module.key) === normalized ||
      normalizeKey(module.resourceType) === normalized ||
      module.aliases.some((alias) => normalizeKey(alias) === normalized),
  );
}

export function parseAuthoringText(text: string, source = '<inline>'): unknown {
  if (Buffer.byteLength(text, 'utf8') > MAX_SOURCE_BYTES) {
    throw new GeneratorInputError('Authoring input exceeds the 2 MiB parser safety limit.', [
      generatorFinding('EOM_GENERATOR_INPUT_TOO_LARGE', 'Authoring input is too large.', source),
    ]);
  }
  if (extname(source).toLowerCase() === '.json') {
    return parseStrictJson(text, source);
  }
  if (/(^|(?:\s|:|\[|,|-))(?:&|\*)[A-Za-z0-9_-]+/mu.test(text)) {
    throw new GeneratorInputError(
      'YAML anchors and aliases are not allowed in public authoring input.',
      [
        generatorFinding(
          'EOM_GENERATOR_YAML_ALIAS',
          'YAML anchors and aliases are disabled.',
          source,
        ),
      ],
    );
  }
  const document = parseDocument(text, {
    schema: 'core',
    strict: true,
    uniqueKeys: true,
    prettyErrors: true,
  });
  if (document.errors.length > 0) {
    throw new GeneratorInputError(
      'YAML parsing failed.',
      document.errors.map((error) =>
        generatorFinding('EOM_GENERATOR_YAML_SYNTAX', error.message, source),
      ),
    );
  }
  let value: unknown;
  try {
    value = document.toJS({ maxAliasCount: 0 }) as unknown;
  } catch (error) {
    throw new GeneratorInputError('YAML alias expansion is not allowed.', [
      generatorFinding(
        'EOM_GENERATOR_YAML_ALIAS',
        error instanceof Error ? error.message : 'YAML aliases are disabled.',
        source,
      ),
    ]);
  }
  assertJsonSafe(value, source, 0);
  return value;
}

export async function readAuthoringValue(
  file: string,
  maxBytes = MAX_SOURCE_BYTES,
): Promise<unknown> {
  const fileStat = await stat(file);
  if (fileStat.size > maxBytes) {
    throw new GeneratorInputError('Authoring input exceeds its configured size limit.', [
      generatorFinding('EOM_GENERATOR_INPUT_TOO_LARGE', 'Authoring input is too large.', file),
    ]);
  }
  const text = (await readFile(file)).toString('utf8');
  return parseAuthoringText(text, file);
}

export async function loadAuthoringConfig(configFile: string): Promise<EomConfig> {
  const absolute = resolve(configFile);
  const value = await readAuthoringValue(absolute, MAX_SOURCE_BYTES);
  const result = validateDocument(value, {
    schemaFile: 'config.schema.json',
    semantic: false,
  });
  if (!result.structuralValid) {
    throw new GeneratorInputError(
      'Authoring configuration does not match config.schema.json.',
      result.findings,
    );
  }
  if (!isJsonObject(value)) {
    throw new GeneratorInputError('Authoring configuration must be an object.');
  }
  return value as unknown as EomConfig;
}

export async function buildPublication(options: BuildOptions): Promise<BuildReport> {
  const configFile = resolve(options.configFile);
  const config = await loadAuthoringConfig(configFile);
  const configDirectory = dirname(configFile);
  const outputRoot = resolve(options.outputRoot ?? resolve(configDirectory, config.output.root));
  const sourceRoot = resolve(configDirectory, config.source.root);
  const maxBytes = config.maxBytes ?? DEFAULT_OUTPUT_MAX_BYTES;
  let parsedSources: readonly ParsedSource[] = [];
  let inputs: readonly BuildInput[] = [];
  try {
    try {
      assertApprovedSourcePath(sourceRoot);
      await assertSafeOutputRoot(outputRoot, configDirectory, sourceRoot, options);
    } catch (error) {
      if (error instanceof CandidatePolicyError) {
        throw new GeneratorInputError(error.message, [
          generatorFinding(
            'EOM_CANDIDATE_SOURCE_BLOCKED',
            'Candidate workspace paths cannot be used as publication generator inputs.',
            config.source.root,
          ),
        ]);
      }
      throw error;
    }
    parsedSources = await discoverSources(config, configFile, configDirectory, maxBytes);
    const selectedSources = selectBuildSources(parsedSources, options.module);
    inputs = selectedSources.map((source) => ({
      path: source.file,
      relativePath: source.relativePath,
      module: source.module.key,
      sha256: source.digest,
    }));
    const moduleBuild = buildModules(config, selectedSources);
    if (options.organization && moduleBuild.organizationId !== options.organization) {
      throw new GeneratorInputError(
        'The requested organization was not found in the selected source.',
        [
          generatorFinding(
            'EOM_GENERATOR_ORGANIZATION_NOT_FOUND',
            'The requested organization identifier is not present in the authoring source.',
            options.organization,
          ),
        ],
      );
    }
    const root = buildManifest(config, moduleBuild.documents, moduleBuild.organizationId);
    const documents = { manifest: root, ...moduleBuild.documents };
    const findings = validateAndLint(
      documents,
      config,
      options.now ?? (options.deterministic === true ? new Date(0) : new Date()),
    );
    const valid = isBuildValid(findings, config);
    const resources = Object.entries(moduleBuild.documents)
      .map(([type, document]) => ({
        type,
        canonical: stringValue(document.canonical) ?? '',
        path: 'public/eom/' + fileNameForResource(type),
        itemCount: itemCount(document),
        sourceFiles: moduleBuild.sourceMap[type] ?? [],
      }))
      .sort((left, right) => left.type.localeCompare(right.type));
    const sourceMap = Object.fromEntries(
      Object.entries(moduleBuild.sourceMap)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, values]) => [key, [...values].sort()]),
    );
    const baseReport: BuildReport = {
      toolVersion: '1.0.0-rc.2',
      specification: SPECIFICATION,
      valid,
      written: false,
      dryRun: options.dryRun === true,
      outputRoot,
      inputs,
      resources,
      findings,
      sourceMap,
      ...(options.module || options.organization
        ? {
            partial: {
              ...(options.module ? { module: options.module } : {}),
              ...(options.organization ? { organization: options.organization } : {}),
            },
          }
        : {}),
    };
    if (!valid || options.dryRun === true) {
      return baseReport;
    }
    const fingerprint = await writePublication(
      outputRoot,
      root,
      moduleBuild.documents,
      baseReport,
      config.output.prettyPrint !== false,
    );
    return { ...baseReport, written: true, fingerprint };
  } catch (error) {
    if (!(error instanceof GeneratorInputError)) throw error;
    return {
      toolVersion: '1.0.0-rc.2',
      specification: SPECIFICATION,
      valid: false,
      written: false,
      dryRun: options.dryRun === true,
      outputRoot,
      inputs,
      resources: [],
      findings:
        error.findings.length > 0
          ? error.findings
          : [generatorFinding('EOM_GENERATOR_INPUT_INVALID', error.message)],
      sourceMap: {},
      ...(options.module || options.organization
        ? {
            partial: {
              ...(options.module ? { module: options.module } : {}),
              ...(options.organization ? { organization: options.organization } : {}),
            },
          }
        : {}),
    };
  }
}

function selectBuildSources(
  sources: readonly ParsedSource[],
  selectedModule: string | undefined,
): readonly ParsedSource[] {
  if (!selectedModule) return sources;
  const module = moduleDefinition(selectedModule);
  if (!module) {
    throw new GeneratorInputError('Unknown build module ' + selectedModule + '.', [
      generatorFinding(
        'EOM_GENERATOR_UNKNOWN_MODULE',
        'The selected build module is not registered.',
        selectedModule,
      ),
    ]);
  }
  const filtered = sources.filter(
    (source) => source.module.key === 'organization' || source.module.key === module.key,
  );
  if (!filtered.some((source) => source.module.key === module.key)) {
    throw new GeneratorInputError('The selected build module has no discovered source files.', [
      generatorFinding(
        'EOM_GENERATOR_MODULE_NOT_FOUND',
        'Add a source file for the selected module or choose another module.',
        module.key,
      ),
    ]);
  }
  return filtered;
}

async function discoverSources(
  config: EomConfig,
  configFile: string,
  configDirectory: string,
  maxBytes: number,
): Promise<readonly ParsedSource[]> {
  const sourceRoot = resolve(configDirectory, config.source.root);
  const modules = config.source.modules;
  const parsed: ParsedSource[] = [];
  const claimedFiles = new Map<string, string>();
  for (const [configuredKey, patterns] of Object.entries(modules)) {
    const module = moduleDefinition(configuredKey);
    if (!module) {
      throw new GeneratorInputError('Unknown source module ' + configuredKey + '.', [
        generatorFinding(
          'EOM_GENERATOR_UNKNOWN_MODULE',
          'The source module is not registered.',
          configuredKey,
        ),
      ]);
    }
    for (const pattern of patterns) {
      const files = await matchingFiles(sourceRoot, pattern);
      for (const file of files) {
        const normalized = resolve(file);
        if (normalized === resolve(configFile)) continue;
        const previous = claimedFiles.get(normalized);
        if (previous && previous !== module.key) {
          throw new GeneratorInputError('Source file is assigned to multiple modules.', [
            generatorFinding(
              'EOM_GENERATOR_SOURCE_MULTI_ASSIGNMENT',
              'A source file may belong to one module only.',
              normalized,
              [previous, module.key],
            ),
          ]);
        }
        if (previous) continue;
        claimedFiles.set(normalized, module.key);
        const fileStat = await stat(normalized);
        if (fileStat.size > maxBytes) {
          throw new GeneratorInputError('Source file exceeds the configured size limit.', [
            generatorFinding(
              'EOM_GENERATOR_INPUT_TOO_LARGE',
              'Source file is too large.',
              normalized,
            ),
          ]);
        }
        const value = await readAuthoringValue(normalized, maxBytes);
        parsed.push({
          module,
          file: normalized,
          relativePath: normalizePath(relative(configDirectory, normalized)),
          value,
          digest: await sha256File(normalized),
        });
      }
    }
  }
  if (parsed.length === 0) {
    throw new GeneratorInputError('No source files were discovered.', [
      generatorFinding(
        'EOM_GENERATOR_NO_SOURCES',
        'The configuration did not discover any source files.',
      ),
    ]);
  }
  return parsed.sort((left, right) => {
    const moduleOrder = left.module.key.localeCompare(right.module.key);
    return moduleOrder !== 0 ? moduleOrder : left.relativePath.localeCompare(right.relativePath);
  });
}

async function assertSafeOutputRoot(
  outputRoot: string,
  configDirectory: string,
  sourceRoot: string,
  options: BuildOptions,
): Promise<void> {
  const configRealDirectory = await realpath(configDirectory);
  const resolvedSourceRoot = await realpath(sourceRoot);
  const projectRoot = await realpath(
    sourceRoot === configDirectory ? dirname(configRealDirectory) : configRealDirectory,
  );
  const outputParent = await existingRealPath(dirname(outputRoot));
  const outputCandidate = join(outputParent, relative(dirname(outputRoot), outputRoot));
  const outputRealPath = await existingRealPath(outputCandidate);
  const buildCandidate = join(dirname(outputCandidate), 'build');
  const buildRealPath = await existingRealPath(buildCandidate);
  const home = await existingRealPath(homedir());
  const cwd = await existingRealPath(process.cwd());

  if (
    parse(outputRealPath).root === outputRealPath ||
    outputRealPath === home ||
    outputRealPath === cwd
  ) {
    throw unsafeOutputError(outputRoot, 'The output directory is a protected filesystem root.');
  }
  if (
    outputRealPath === projectRoot ||
    outputRealPath === configRealDirectory ||
    outputRealPath === resolvedSourceRoot ||
    isWithin(resolvedSourceRoot, outputRealPath) ||
    isWithin(outputRealPath, resolvedSourceRoot) ||
    isWithin(outputRealPath, configRealDirectory)
  ) {
    throw unsafeOutputError(
      outputRoot,
      'The output directory must not replace, contain, or sit inside the authoring project inputs.',
    );
  }
  if (resolvedSourceRoot !== configRealDirectory && !isWithin(projectRoot, resolvedSourceRoot)) {
    throw unsafeOutputError(
      sourceRoot,
      'The source directory must be a real descendant of the authoring project; symlink escapes are not allowed.',
    );
  }
  if (buildRealPath === resolvedSourceRoot || isWithin(resolvedSourceRoot, buildRealPath)) {
    throw unsafeOutputError(
      buildCandidate,
      'The build-report directory must not sit inside the source root.',
    );
  }
  if (options.allowExternalOutput !== true && !isWithin(projectRoot, outputRealPath)) {
    throw unsafeOutputError(
      outputRoot,
      'The output directory must be inside the authoring project unless external output is explicitly enabled.',
    );
  }
  if (options.allowExternalOutput !== true && !isWithin(projectRoot, buildRealPath)) {
    throw unsafeOutputError(
      buildCandidate,
      'The build-report directory must be inside the authoring project unless external output is explicitly enabled.',
    );
  }

  await assertReplaceableDirectory(outputCandidate, options, outputRoot);
  await assertReplaceableDirectory(buildCandidate, options, buildCandidate);
}

async function assertReplaceableDirectory(
  directory: string,
  options: BuildOptions,
  displayPath: string,
): Promise<void> {
  try {
    const information = await stat(directory);
    if (!information.isDirectory()) {
      throw unsafeOutputError(displayPath, 'The output target must be a directory.');
    }
    try {
      await stat(join(directory, GENERATED_MARKER));
    } catch {
      throw unsafeOutputError(
        displayPath,
        `Refusing to replace an existing unmarked directory. Add ${GENERATED_MARKER} or use the explicit force option.`,
      );
    }
  } catch (error) {
    if (isNotFound(error)) return;
    throw error;
  }
}

async function existingRealPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if (!isNotFound(error)) throw error;
    const parent = dirname(path);
    if (parent === path) return resolve(path);
    return join(await existingRealPath(parent), path.slice(parent.length + 1));
  }
}

function isWithin(parent: string, child: string): boolean {
  const value = relative(parent, child);
  return value === '' || (value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

function unsafeOutputError(path: string, message: string): GeneratorInputError {
  return new GeneratorInputError(message, [
    generatorFinding('EOM_GENERATOR_OUTPUT_UNSAFE', message, path),
  ]);
}

async function matchingFiles(root: string, pattern: string): Promise<readonly string[]> {
  const normalizedPattern = normalizePath(pattern).replace(/^\.\//u, '');
  const allFiles = await walkFiles(root);
  const matcher = globRegExp(normalizedPattern);
  return allFiles
    .filter((file) => matcher.test(normalizePath(relative(root, file))))
    .sort((left, right) =>
      normalizePath(relative(root, left)).localeCompare(normalizePath(relative(root, right))),
    );
}

async function walkFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function globRegExp(pattern: string): RegExp {
  let expression = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index] ?? '';
    if (character === '*' && pattern[index + 1] === '*') {
      index += 1;
      if (pattern[index + 1] === '/') {
        index += 1;
        expression += '(?:.*/)?';
      } else {
        expression += '.*';
      }
    } else if (character === '*') {
      expression += '[^/]*';
    } else if (character === '?') {
      expression += '[^/]';
    } else {
      expression += escapeRegExp(character);
    }
  }
  return new RegExp(expression + '$', 'u');
}

function buildModules(config: EomConfig, sources: readonly ParsedSource[]): ModuleBuild {
  const groups = new Map<string, ParsedSource[]>();
  for (const source of sources) {
    const group = groups.get(source.module.key) ?? [];
    group.push(source);
    groups.set(source.module.key, group);
  }
  const organizationSources = groups.get('organization') ?? [];
  if (organizationSources.length === 0) {
    throw new GeneratorInputError('An organization source is required.', [
      generatorFinding('EOM_GENERATOR_ORGANIZATION_REQUIRED', 'Add source.modules.organization.'),
    ]);
  }
  const organizationValue = selectOrganizationValue(organizationSources);
  const organization = normalizeOrganization(organizationValue, config);
  const organizationId = stringValue(organization.id);
  if (!organizationId) {
    throw new GeneratorInputError('The organization source must have an id.', [
      generatorFinding('EOM_GENERATOR_ID_REQUIRED', 'The organization source has no stable id.'),
    ]);
  }
  const documents: Record<string, JsonObject> = {
    'organization-profile': organization,
  };
  const sourceMap: Record<string, readonly string[]> = {
    'organization-profile': organizationSources.map((source) => source.relativePath),
  };
  const contacts = groups.get('contacts') ?? [];
  if (contacts.length > 0) {
    const contactDocument = buildContactDocument(contacts, organizationId, config);
    documents['contact-directory'] = contactDocument;
    sourceMap['contact-directory'] = contacts.map((source) => source.relativePath);
  }
  for (const module of MODULES) {
    if (module.key === 'organization' || module.key === 'contacts') continue;
    const moduleSources = groups.get(module.key) ?? [];
    if (moduleSources.length === 0) continue;
    const items: JsonObject[] = [];
    const sourceFiles = new Set<string>();
    const itemIds = new Set<string>();
    let sourceEnvelope: JsonObject | undefined;
    for (const source of moduleSources) {
      const value = source.value;
      if (isJsonObject(value) && Array.isArray(value.items)) {
        sourceEnvelope ??= value;
      }
      for (const item of extractItems(value, module)) {
        const normalized = normalizeModuleItem(module, item, config.publisher.origin);
        const id = stringValue(normalized.id);
        if (!id) {
          throw new GeneratorInputError('Every module item needs a stable id.', [
            generatorFinding(
              'EOM_GENERATOR_ID_REQUIRED',
              'A module item has no stable id.',
              source.file,
            ),
          ]);
        }
        if (itemIds.has(id)) {
          throw new GeneratorInputError('Duplicate module item id ' + id + '.', [
            generatorFinding(
              'EOM_GENERATOR_DUPLICATE_ID',
              'Stable IDs must be unique within a module.',
              source.file,
              [id],
            ),
          ]);
        }
        itemIds.add(id);
        items.push(normalized);
        sourceFiles.add(source.relativePath);
      }
    }
    items.sort((left, right) => textValue(left.id).localeCompare(textValue(right.id)));
    const document = moduleResource(module, items, config, organizationId, sourceEnvelope);
    documents[module.resourceType] = document;
    sourceMap[module.resourceType] = [...sourceFiles].sort();
  }
  return { documents, sourceMap, organizationId };
}

function selectOrganizationValue(sources: readonly ParsedSource[]): unknown {
  const first = sources[0]?.value;
  if (isJsonObject(first) && Array.isArray(first.items)) {
    return first.items[0];
  }
  if (Array.isArray(first)) return first[0];
  return first;
}

function buildContactDocument(
  sources: readonly ParsedSource[],
  organizationId: string,
  config: EomConfig,
): JsonObject {
  const contacts: JsonObject[] = [];
  const ids = new Set<string>();
  for (const source of sources) {
    for (const item of extractItems(source.value, {
      key: 'contacts',
      aliases: [],
      resourceType: 'contact-directory',
      fileName: 'contacts.json',
    })) {
      const normalized = normalizeContact(item, config.publisher.origin, organizationId);
      const id = stringValue(normalized.id);
      if (!id) {
        throw new GeneratorInputError('Every contact needs a stable id.', [
          generatorFinding('EOM_GENERATOR_ID_REQUIRED', 'A contact has no stable id.', source.file),
        ]);
      }
      if (ids.has(id)) {
        throw new GeneratorInputError('Duplicate contact id ' + id + '.', [
          generatorFinding(
            'EOM_GENERATOR_DUPLICATE_ID',
            'Stable IDs must be unique in the contact directory.',
            source.file,
            [id],
          ),
        ]);
      }
      ids.add(id);
      contacts.push(normalized);
    }
  }
  contacts.sort((left, right) => textValue(left.id).localeCompare(textValue(right.id)));
  const document: Record<string, unknown> = {
    $schema: 'https://paperandslate.org/schemas/eom/1.0/contact-directory.schema.json',
    specification: SPECIFICATION,
    version: '1.0',
    id: config.publisher.origin + '/eom/resource/contacts',
    type: 'contact-directory',
    canonical: config.publisher.origin + '/eom/contacts.json',
    subject: organizationId,
    defaultLanguage: config.project.defaultLanguage,
    contacts,
  };
  addPublicationDates(document, config);
  return asJsonObject(document, 'contact directory');
}

function extractItems(value: unknown, module: ModuleDefinition): readonly JsonObject[] {
  if (Array.isArray(value)) {
    return value.filter(isJsonObject);
  }
  if (!isJsonObject(value)) return [];
  if (Array.isArray(value.items)) {
    return value.items.filter(isJsonObject);
  }
  if (module.key === 'contacts' && Array.isArray(value.contacts)) {
    return value.contacts.filter(isJsonObject);
  }
  if (module.key === 'organization' && Array.isArray(value.organizations)) {
    return value.organizations.filter(isJsonObject);
  }
  return [value];
}

function normalizeOrganization(value: unknown, config: EomConfig): JsonObject {
  if (!isJsonObject(value)) {
    throw new GeneratorInputError('Organization source must be an object.', [
      generatorFinding(
        'EOM_GENERATOR_ORGANIZATION_OBJECT',
        'Organization source must be an object.',
      ),
    ]);
  }
  const source = { ...value };
  const sourceType = stringValue(source.type);
  const organizationType =
    stringValue(source.organizationType) ??
    sourceType ??
    config.publisher.organizationType ??
    'organization';
  const id = stringValue(source.id);
  const canonical =
    stringValue(source.canonical) ??
    stringValue(source.canonicalUrl) ??
    config.publisher.origin + '/eom/organization.json';
  const document: Record<string, unknown> = {
    $schema: 'https://paperandslate.org/schemas/eom/1.0/organization-profile.schema.json',
    specification: SPECIFICATION,
    version: '1.0',
    id,
    type: 'organization-profile',
    canonical,
    name: source.name ?? config.publisher.organizationName ?? config.project.name,
    organizationType,
  };
  copyIfPresent(source, document, [
    'alternateNames',
    'description',
    'website',
    'identifiers',
    'address',
    'status',
    'founded',
    'defaultLanguage',
    'supportedLanguages',
    'provenance',
    'extensions',
  ]);
  if (source.canonicalUrl && !document.website) document.website = source.canonicalUrl;
  const parent = source.parent ?? source.governingOrganization;
  if (parent) document.parent = toEntityRef(parent);
  for (const key of ['children', 'contacts', 'campuses', 'departments']) {
    if (Array.isArray(source[key])) {
      document[key] = source[key].map(toEntityRef);
    }
  }
  const languages = isJsonObject(source.languages) ? source.languages : undefined;
  if (!document.defaultLanguage && languages && typeof languages.default === 'string') {
    document.defaultLanguage = languages.default;
  }
  if (!document.supportedLanguages && languages && Array.isArray(languages.supported)) {
    document.supportedLanguages = languages.supported;
  }
  addPublicationDates(document, config);
  return asJsonObject(document, 'organization profile');
}

function normalizeContact(value: JsonObject, origin: string, organizationId: string): JsonObject {
  const source = { ...value };
  const document: Record<string, unknown> = { ...source };
  document.id =
    stringValue(source.id) ??
    origin + '/id/contact/' + slugify(source.role ?? source.name ?? 'contact');
  document.type = 'contact-point';
  if (!document.role && source.name) document.role = source.name;
  delete document.name;
  for (const key of ['organization', 'department', 'person']) {
    if (document[key]) document[key] = toEntityRef(document[key]);
  }
  if (!document.organization) document.organization = { id: organizationId };
  return asJsonObject(document, 'contact');
}

function normalizeModuleItem(
  module: ModuleDefinition,
  value: JsonObject,
  origin: string,
): JsonObject {
  const source: Record<string, unknown> = { ...value };
  const aliases: Record<string, string> = {
    timezone: 'timeZone',
    workLocation: 'location',
    closesAt: 'closingAt',
    processUrl: 'applicationUrl',
  };
  for (const [from, to] of Object.entries(aliases)) {
    if (source[to] === undefined && source[from] !== undefined) source[to] = source[from];
    if (from !== to) delete source[from];
  }
  if (module.key === 'news' && source.articleUrl === undefined && source.url !== undefined) {
    source.articleUrl = source.url;
    delete source.url;
  }
  if (module.key === 'policies' && source.documentUrl === undefined && source.url !== undefined) {
    source.documentUrl = source.url;
    delete source.url;
  }
  if (module.key === 'jobs' && source.name === undefined && source.title !== undefined) {
    source.name = source.title;
    delete source.title;
  }
  if (module.key === 'admissions' && source.name === undefined && source.title !== undefined) {
    source.name = source.title;
    delete source.title;
  }
  if (module.key === 'news' && source.headline === undefined && source.title !== undefined) {
    source.headline = source.title;
    delete source.title;
  }
  if (module.key === 'policies' && source.name === undefined && source.title !== undefined) {
    source.name = source.title;
    delete source.title;
  }
  source.type = module.itemType ?? source.type;
  if (!source.id) {
    source.id =
      origin +
      '/id/' +
      module.key +
      '/' +
      slugify(source.code ?? source.name ?? source.title ?? module.key);
  }
  const referenceKeys = new Set([
    'provider',
    'organization',
    'department',
    'parentOrganization',
    'parentDepartment',
    'operator',
    'campus',
    'location',
    'contact',
    'advisor',
    'sport',
    'course',
    'academicPeriod',
    'operatingCalendar',
    'support',
    'organizationRef',
    'publicContact',
    'qualification',
    'replaces',
    'replacedBy',
  ]);
  const referenceArrays = new Set([
    'departments',
    'courses',
    'programs',
    'campuses',
    'organizations',
    'organizationsServed',
    'routes',
    'coaches',
    'homeFacilities',
    'instructors',
    'sections',
    'locations',
    'qualifications',
    'relatedCourses',
    'publicCourses',
    'teams',
    'subjects',
    'corequisites',
    'certifications',
    'dualCreditPartners',
    'nextCourses',
    'equivalentCourses',
    'partnerOrganizations',
  ]);
  for (const key of referenceKeys) {
    if (source[key] !== undefined) source[key] = toEntityRef(source[key]);
  }
  for (const key of referenceArrays) {
    if (Array.isArray(source[key])) source[key] = source[key].map(toEntityRef);
  }
  if (module.key === 'courses' && source.credits && !Array.isArray(source.credits)) {
    source.credits = [source.credits];
  }
  if (module.key === 'courses' && source.provider === undefined) {
    throw new GeneratorInputError('A course source must declare provider.', [
      generatorFinding('EOM_GENERATOR_COURSE_PROVIDER', 'Course provider is required.'),
    ]);
  }
  if (module.key === 'offerings' && source.course === undefined) {
    throw new GeneratorInputError('An offering source must reference a course.', [
      generatorFinding('EOM_GENERATOR_OFFERING_COURSE', 'Course offering references are required.'),
    ]);
  }
  if (module.key === 'calendar' && source.academicYear === undefined && source.year !== undefined) {
    source.academicYear = source.year;
    delete source.year;
  }
  return asJsonObject(source, module.key + ' item');
}

function moduleResource(
  module: ModuleDefinition,
  items: readonly JsonObject[],
  config: EomConfig,
  organizationId: string,
  sourceEnvelope?: JsonObject,
): JsonObject {
  const document: Record<string, unknown> = {
    $schema:
      'https://paperandslate.org/schemas/eom/1.0/modules/' + module.resourceType + '.schema.json',
    specification: SPECIFICATION,
    version: '1.0',
    id: config.publisher.origin + '/eom/resource/' + module.key,
    type: module.resourceType,
    canonical: config.publisher.origin + '/eom/' + module.fileName,
    subjects: [organizationId],
    items,
  };
  if (sourceEnvelope) {
    copyIfPresent(sourceEnvelope, document, [
      'title',
      'description',
      'defaultLanguage',
      'supportedLanguages',
      'license',
      'effective',
      'catalogVersion',
      'releaseStatus',
      'provenance',
      'extensions',
    ]);
  }
  addPublicationDates(document, config);
  return asJsonObject(document, module.key + ' resource');
}

function buildManifest(
  config: EomConfig,
  documents: Readonly<Record<string, JsonObject>>,
  organizationId: string,
): JsonObject {
  const organization = documents['organization-profile'];
  const organizationName =
    organization?.name ?? config.publisher.organizationName ?? config.project.name;
  const organizationType =
    stringValue(organization?.organizationType) ??
    config.publisher.organizationType ??
    'organization';
  const profileHref =
    stringValue(organization?.canonical) ?? config.publisher.origin + '/eom/organization.json';
  const resourceEntries = Object.entries(documents)
    .map(([type, document]) => {
      const shortName = shortNameForResource(type);
      const descriptor: Record<string, unknown> = {
        id: config.publisher.origin + '/eom/resource/' + shortName,
        type,
        href:
          stringValue(document.canonical) ??
          config.publisher.origin + '/eom/' + fileNameForResource(type),
        mediaType: 'application/json',
        version: '1.0',
        subjects: [organizationId],
      };
      if (document.modified) descriptor.modified = document.modified;
      if (document.expires) descriptor.expires = document.expires;
      if (document.defaultLanguage) descriptor.languages = [document.defaultLanguage];
      return descriptor;
    })
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const capabilities = resourceEntries.map((resource) => ({
    id: SPECIFICATION + '/capabilities/' + String(resource.type),
    version: '1.0',
    status: 'active',
    resources: [resource.id],
  }));
  const contactDocument = documents['contact-directory'];
  const contactItems =
    contactDocument && Array.isArray(contactDocument.contacts) ? contactDocument.contacts : [];
  const root: Record<string, unknown> = {
    $schema: MANIFEST_SCHEMA,
    specification: SPECIFICATION,
    version: '1.0',
    id:
      config.publisher.origin +
      (config.publisher.manifestPath || '/.well-known/educational-organization-manifest'),
    type: 'manifest',
    canonical:
      config.publisher.origin +
      (config.publisher.manifestPath || '/.well-known/educational-organization-manifest'),
    publisher: {
      id: config.publisher.organizationId ?? organizationId,
      name: organizationName,
      type: organizationType,
      website: config.publisher.origin + '/',
    },
    scope: {
      origin: config.publisher.origin,
      paths: ['/'],
      canonicalOrigins: [config.publisher.origin],
      scopeStatement: 'Public EOM resources for ' + textValue(organizationName) + '.',
    },
    organizations: [
      {
        id: organizationId,
        type: organizationType,
        name: organizationName,
        canonicalUrl: stringValue(organization?.website) ?? profileHref,
        profile: profileHref,
      },
    ],
    defaultLanguage: config.project.defaultLanguage,
    supportedLanguages: config.project.supportedLanguages ?? [config.project.defaultLanguage],
    capabilities,
    resources: resourceEntries,
  };
  if (contactItems.length > 0) {
    root.contacts = contactItems.filter(isJsonObject).map((item) => ({ id: textValue(item.id) }));
  }
  if (config.publication?.notice) {
    root.notices = [
      {
        id: config.publisher.origin + '/id/notice/publication',
        title: 'Publication notice',
        message: config.publication.notice,
      },
    ];
  }
  if (config.publication?.indexingPolicy) {
    root.indexingPolicy = config.publication.indexingPolicy;
  }
  addPublicationDates(root, config);
  return asJsonObject(root, 'manifest');
}

function validateAndLint(
  documents: Readonly<Record<string, JsonObject>>,
  config: EomConfig,
  now: Date,
): readonly Finding[] {
  const findings: Finding[] = [];
  for (const [name, document] of Object.entries(documents)) {
    const result = validateDocument(document, { now });
    findings.push(...result.findings.map((item) => ({ ...item, resource: name })));
    if (config.validation?.privacyLint !== false) {
      findings.push(
        ...lintPublication(document, { now }).map((item) => ({ ...item, resource: name })),
      );
    }
  }
  findings.push(
    ...publicationSetFindings(documents, { now }).map((item) => ({
      ...item,
      resource: item.resource ?? 'publication-set',
    })),
  );
  return findings;
}

function isBuildValid(findings: readonly Finding[], config: EomConfig): boolean {
  const failOn = new Set(config.validation?.failOn ?? ['error']);
  return !findings.some((item) => item.severity === 'error' || failOn.has(item.severity));
}

async function writePublication(
  outputRoot: string,
  root: JsonObject,
  documents: Readonly<Record<string, JsonObject>>,
  report: BuildReport,
  prettyPrint: boolean,
): Promise<string> {
  const parent = dirname(outputRoot);
  await mkdir(parent, { recursive: true });
  const temporary = await mkdtemp(join(parent, '.eom-public-'));
  try {
    const wellKnown = join(temporary, '.well-known');
    const eom = join(temporary, 'eom');
    await mkdir(wellKnown, { recursive: true });
    await mkdir(eom, { recursive: true });
    await writeJson(
      join(temporary, GENERATED_MARKER),
      {
        generator: 'eom',
        specification: report.specification,
        toolVersion: report.toolVersion,
      },
      true,
    );
    await writeJson(join(wellKnown, 'educational-organization-manifest'), root, prettyPrint);
    await writeJson(join(wellKnown, 'educational-organization-manifest.json'), root, prettyPrint);
    for (const [type, document] of Object.entries(documents)) {
      await writeJson(join(eom, fileNameForResource(type)), document, prettyPrint);
    }
    const publicFiles = await walkFiles(temporary);
    const outputEntries: JsonObject[] = [];
    for (const file of publicFiles) {
      outputEntries.push({
        path: normalizePath(relative(temporary, file)),
        sha256: await sha256File(file),
      });
    }
    outputEntries.sort((left, right) => textValue(left.path).localeCompare(textValue(right.path)));
    const fingerprint = sha256Text(jsonText(outputEntries, true));
    const buildDirectory = join(parent, 'build');
    const buildTemporary = await mkdtemp(join(parent, '.eom-build-'));
    try {
      await writeJson(
        join(buildTemporary, 'input-manifest.json'),
        {
          toolVersion: report.toolVersion,
          specification: report.specification,
          files: report.inputs.map((input) => ({
            path: input.relativePath,
            module: input.module,
            sha256: input.sha256,
          })),
        },
        true,
      );
      await writeJson(
        join(buildTemporary, GENERATED_MARKER),
        {
          generator: 'eom',
          specification: report.specification,
          toolVersion: report.toolVersion,
        },
        true,
      );
      await writeJson(
        join(buildTemporary, 'output-manifest.json'),
        {
          toolVersion: report.toolVersion,
          specification: report.specification,
          files: outputEntries,
          fingerprint,
        },
        true,
      );
      await writeJson(
        join(buildTemporary, 'validation.json'),
        {
          valid: report.valid,
          findings: report.findings,
        },
        true,
      );
      await writeJson(
        join(buildTemporary, 'lint.json'),
        {
          findings: report.findings.filter(
            (item) =>
              item.category === 'privacy' ||
              item.category === 'quality' ||
              item.category === 'security' ||
              item.category === 'freshness',
          ),
        },
        true,
      );
      await writeJson(join(buildTemporary, 'source-map.json'), report.sourceMap, true);
      await writeJson(
        join(buildTemporary, 'reproducibility.json'),
        {
          deterministic: true,
          canonicalJson: true,
          fingerprint,
          inputFingerprint: sha256Text(
            jsonText(
              report.inputs.map((input) => ({
                path: input.relativePath,
                module: input.module,
                sha256: input.sha256,
              })),
              true,
            ),
          ),
        },
        true,
      );
      await writeJson(
        join(buildTemporary, 'build-report.json'),
        {
          toolVersion: report.toolVersion,
          specification: report.specification,
          valid: report.valid,
          inputs: report.inputs.map((input) => ({
            path: input.relativePath,
            module: input.module,
            sha256: input.sha256,
          })),
          resources: report.resources,
          findings: report.findings,
          fingerprint,
        },
        true,
      );
      await replaceDirectory(buildTemporary, buildDirectory);
    } catch (error) {
      await rm(buildTemporary, { recursive: true, force: true });
      throw error;
    }
    await replaceDirectory(temporary, outputRoot);
    return fingerprint;
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

async function replaceDirectory(temporary: string, target: string): Promise<void> {
  const parent = dirname(target);
  await mkdir(parent, { recursive: true });
  const backup = target + '.previous-' + process.pid;
  let movedExisting = false;
  try {
    try {
      await rename(target, backup);
      movedExisting = true;
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    await rename(temporary, target);
    if (movedExisting) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    if (movedExisting) {
      try {
        await rename(backup, target);
      } catch {
        // Preserve the original error; the caller reports the failed build.
      }
    }
    throw error;
  }
}

async function writeJson(path: string, value: unknown, prettyPrint: boolean): Promise<void> {
  await writeFile(path, jsonText(value, prettyPrint), 'utf8');
}

function addPublicationDates(document: Record<string, unknown>, config: EomConfig): void {
  if (config.publication?.modified) document.modified = config.publication.modified;
  if (config.publication?.expires) document.expires = config.publication.expires;
}

function copyIfPresent(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  keys: readonly string[],
): void {
  for (const key of keys) {
    if (source[key] !== undefined) target[key] = source[key];
  }
}

function toEntityRef(value: unknown): JsonObject {
  if (typeof value === 'string') return { id: value };
  if (!isJsonObject(value)) return { id: String(value) };
  const reference: Record<string, unknown> = { id: value.id };
  for (const key of ['type', 'name']) {
    if (value[key] !== undefined) reference[key] = value[key];
  }
  return asJsonObject(reference, 'entity reference');
}

function itemCount(document: JsonObject): number {
  if (Array.isArray(document.items)) return document.items.length;
  if (Array.isArray(document.contacts)) return document.contacts.length;
  return 1;
}

function shortNameForResource(type: string): string {
  if (type === 'organization-profile') return 'organization';
  if (type === 'contact-directory') return 'contacts';
  return moduleDefinition(type)?.key ?? type.replace(/-catalog$/u, '');
}

function fileNameForResource(type: string): string {
  if (type === 'organization-profile') return 'organization.json';
  if (type === 'contact-directory') return 'contacts.json';
  return moduleDefinition(type)?.fileName ?? type + '.json';
}

function normalizeKey(value: string): string {
  return value.replace(/[-_\\s]/gu, '').toLowerCase();
}

function normalizePath(value: string): string {
  return value.split(sep).join('/');
}

function slugify(value: unknown): string {
  const slug = String(value)
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .toLowerCase();
  return slug || 'item';
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return `${value}`;
  }
  return JSON.stringify(value) ?? Object.prototype.toString.call(value);
}

function asJsonObject(value: unknown, label: string): JsonObject {
  assertJsonSafe(value, label, 0);
  if (!isJsonObject(value)) throw new GeneratorInputError(label + ' must be an object.');
  return value;
}

function assertJsonSafe(value: unknown, source: string, depth: number): asserts value is JsonValue {
  if (depth > 64) {
    throw new GeneratorInputError('Authoring nesting exceeds the safety limit.', [
      generatorFinding('EOM_GENERATOR_NESTING_LIMIT', 'Authoring nesting is too deep.', source),
    ]);
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertJsonSafe(item, source, depth + 1);
    return;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      assertJsonSafe(child, source + '/' + key, depth + 1);
    }
    return;
  }
  throw new GeneratorInputError('Authoring input contains a non-JSON value.', [
    generatorFinding(
      'EOM_GENERATOR_NON_JSON_VALUE',
      'Only JSON-compatible YAML values are allowed.',
      source,
    ),
  ]);
}

function jsonText(value: unknown, prettyPrint: boolean): string {
  const jsonValue = stableJsonValue(asJsonValue(value, 'JSON output'));
  return prettyPrint ? stringifyCanonical(jsonValue) : JSON.stringify(jsonValue) + '\n';
}

function asJsonValue(value: unknown, label: string): JsonValue {
  assertJsonSafe(value, label, 0);
  return value;
}

function generatorFinding(
  code: string,
  message: string,
  resource?: string,
  related: readonly string[] = [],
): Finding {
  return {
    code,
    category: code.indexOf('YAML') >= 0 || code.indexOf('INPUT') >= 0 ? 'syntax' : 'quality',
    message,
    severity: 'error',
    ...(resource ? { resource } : {}),
    ...(related.length > 0 ? { related } : {}),
  };
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function sha256File(path: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/gu, '\\$&');
}

function isNotFound(error: unknown): boolean {
  return isNodeError(error) && error.code === 'ENOENT';
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
