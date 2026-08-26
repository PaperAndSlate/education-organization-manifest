import { readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { Command } from 'commander';
import { buildReviewReport, detectConflicts, type ReviewReport } from '@paperandslate/eom-agentic';
import { mapInput, supportedAdapterFormats, type AdapterFormat } from '@paperandslate/eom-adapters';
import { buildPublication, type BuildReport } from '@paperandslate/eom-generator';
import { lintPublication } from '@paperandslate/eom-linter';
import { signDetached, verifyDetached } from '@paperandslate/eom-signatures';
import {
  conformanceReportSummary,
  isConformanceProfileName,
  runConformance,
  type ConformanceReport,
} from '@paperandslate/eom-testkit';
import {
  EomFetchError,
  fetchManifest,
  isJsonObject,
  parseStrictJson,
  stringifyCanonical,
} from '@paperandslate/eom-core';
import {
  availableSchemaFiles,
  readSchema,
  schemaFileForType,
  type SchemaFile,
} from '@paperandslate/eom-schema';
import {
  validateDocument,
  hasErrors,
  type Finding,
  type ValidationResult,
} from '@paperandslate/eom-validator';

export interface CliOutput {
  readonly command: string;
  readonly file: string;
  readonly result?: ValidationResult;
  readonly findings?: readonly Finding[];
  readonly report?: BuildReport;
  readonly conformance?: ConformanceReport;
  readonly review?: ReviewReport;
  readonly summary?: Record<string, unknown>;
}

export function createCli(): Command {
  const program = new Command();
  program
    .name('eom')
    .description('Validate, lint, and inspect Educational Organization Manifest publications.')
    .version('0.1.0');

  program
    .command('build')
    .argument('[config]', 'authoring configuration file')
    .option('--config <file>', 'authoring configuration file')
    .option('--output <directory>', 'generated public output directory')
    .option('--dry-run', 'validate and report without writing output')
    .option('--json', 'emit machine-readable JSON')
    .action(
      async (
        configArgument: string | undefined,
        options: { config?: string; output?: string; dryRun?: boolean; json?: boolean },
      ) => {
        const report = await buildPublication({
          configFile: options.config ?? configArgument ?? 'eom.config.yaml',
          ...(options.output ? { outputRoot: options.output } : {}),
          dryRun: options.dryRun === true,
        });
        emit(
          { command: 'build', file: options.config ?? configArgument ?? 'eom.config.yaml', report },
          options.json === true,
        );
        if (!report.valid) process.exitCode = 1;
      },
    );

  program
    .command('map')
    .argument('<format>', 'registered interoperability adapter format')
    .argument('<file>', 'local JSON, XML, iCalendar, or feed file')
    .option('--source-id <uri>', 'source URI recorded on generated claims')
    .option('--observed-at <date-time>', 'observation timestamp recorded on generated claims')
    .option('--target-resource-id <uri>', 'target EOM resource URI')
    .option('--json', 'emit machine-readable JSON')
    .action(
      async (
        formatValue: string,
        file: string,
        options: {
          sourceId?: string;
          observedAt?: string;
          targetResourceId?: string;
          json?: boolean;
        },
      ) => {
        const format = parseAdapterFormat(formatValue);
        const input = await readAdapterInput(file, format);
        const result = mapInput(format, input, {
          ...(options.sourceId ? { sourceId: options.sourceId } : {}),
          ...(options.observedAt ? { observedAt: options.observedAt } : {}),
          ...(options.targetResourceId ? { targetResourceId: options.targetResourceId } : {}),
        });
        emit(
          { command: 'map', file, summary: result as unknown as Record<string, unknown> },
          options.json === true,
        );
        if (result.quarantined || result.findings.some((item) => item.severity === 'error')) {
          process.exitCode = 1;
        }
      },
    );

  program
    .command('sign')
    .argument('<file>', 'local JSON resource to sign')
    .requiredOption('--key <file>', 'private Ed25519 key file')
    .requiredOption('--key-id <uri>', 'public key id URI')
    .option('--output <file>', 'detached signature output file')
    .option('--json', 'emit machine-readable JSON')
    .action(
      async (
        file: string,
        options: { key: string; keyId: string; output?: string; json?: boolean },
      ) => {
        const document = await readPublication(file);
        const privateKey = await readFile(resolve(options.key), 'utf8');
        const signature = signDetached(document, {
          privateKey,
          keyId: options.keyId,
        });
        if (options.output) {
          await writeFile(
            resolve(options.output),
            `${JSON.stringify(signature, null, 2)}\n`,
            'utf8',
          );
        }
        emit(
          {
            command: 'sign',
            file,
            summary: {
              signature,
              ...(options.output ? { output: resolve(options.output) } : {}),
              privateKeyWritten: false,
            },
          },
          options.json === true,
        );
      },
    );

  program
    .command('verify')
    .argument('<file>', 'local JSON resource to verify')
    .requiredOption('--signature <file>', 'detached signature record')
    .requiredOption('--key-set <file>', 'public verification key-set resource')
    .option('--manifest <file>', 'root manifest for authority evaluation')
    .option('--resource-url <url>', 'retrieved resource URL for authority evaluation')
    .option('--json', 'emit machine-readable JSON')
    .action(
      async (
        file: string,
        options: {
          signature: string;
          keySet: string;
          manifest?: string;
          resourceUrl?: string;
          json?: boolean;
        },
      ) => {
        const document = await readPublication(file);
        const signature = await readPublication(options.signature);
        const keySet = await readPublication(options.keySet);
        const manifest = options.manifest ? await readPublication(options.manifest) : undefined;
        const result = verifyDetached(document, signature, keySet, {
          ...(manifest === undefined || options.resourceUrl === undefined
            ? {}
            : { manifest, resource: document, finalUrl: options.resourceUrl }),
        });
        emit(
          { command: 'verify', file, summary: result as unknown as Record<string, unknown> },
          options.json === true,
        );
        if (!result.overall) process.exitCode = 5;
      },
    );

  program
    .command('candidate')
    .argument('<workspace>', 'candidate workspace JSON record')
    .option('--claims <file>', 'claim ledger JSON array')
    .option('--sources <file>', 'source inventory JSON array')
    .option('--conflicts <file>', 'conflict records JSON array')
    .option('--data <file>', 'candidate value JSON to privacy-review')
    .option('--json', 'emit machine-readable JSON')
    .action(
      async (
        workspaceFile: string,
        options: {
          claims?: string;
          sources?: string;
          conflicts?: string;
          data?: string;
          json?: boolean;
        },
      ) => {
        const workspace = await readPublication(workspaceFile);
        const claims = options.claims ? await readJsonArray(options.claims) : [];
        const sources = options.sources ? await readJsonArray(options.sources) : [];
        const conflicts = options.conflicts
          ? await readJsonArray(options.conflicts)
          : detectConflicts(claims);
        const candidateValue = options.data ? await readPublication(options.data) : undefined;
        const review = buildReviewReport(workspace, sources, claims, conflicts, candidateValue);
        emit({ command: 'candidate', file: workspaceFile, review }, options.json === true);
        if (review.publication !== 'release-approved') process.exitCode = 1;
      },
    );

  program
    .command('conformance')
    .argument('<directory>', 'local captured publication directory')
    .option('--profile <profile>', 'versioned conformance profile', 'publisher-core')
    .option('--implementation <name>', 'implementation name recorded in the report')
    .option('--implementation-version <version>', 'implementation version recorded in the report')
    .option('--output <file>', 'write the canonical machine-readable report to a local file')
    .option('--json', 'emit machine-readable JSON')
    .action(
      async (
        directory: string,
        options: {
          profile: string;
          implementation?: string;
          implementationVersion?: string;
          output?: string;
          json?: boolean;
        },
      ) => {
        if (!isConformanceProfileName(options.profile)) {
          throw new Error(`Unknown conformance profile ${options.profile}.`);
        }
        const report = await runConformance({
          directory,
          profile: options.profile,
          ...(options.implementation ? { implementationName: options.implementation } : {}),
          ...(options.implementationVersion
            ? { implementationVersion: options.implementationVersion }
            : {}),
        });
        if (options.output) {
          await writeFile(resolve(options.output), stringifyCanonical(report as never), 'utf8');
        }
        emit(
          {
            command: 'conformance',
            file: directory,
            conformance: report,
            summary: conformanceReportSummary(report),
          },
          options.json === true,
        );
        if (report.status === 'non-conforming') process.exitCode = 1;
      },
    );

  program
    .command('validate')
    .argument('<file>', 'local JSON file, or - for stdin')
    .option('--json', 'emit machine-readable JSON')
    .option('--no-semantic', 'skip semantic validation')
    .action(async (file: string, options: { json?: boolean; semantic?: boolean }) => {
      const document = await readPublication(file);
      const result = validateDocument(
        document,
        options.semantic === undefined ? {} : { semantic: options.semantic },
      );
      emit({ command: 'validate', file, result }, options.json === true);
      if (!result.valid) process.exitCode = 1;
    });

  program
    .command('lint')
    .argument('<file>', 'local JSON file, or - for stdin')
    .option('--json', 'emit machine-readable JSON')
    .option('--strict-privacy', 'treat privacy findings as errors')
    .action(async (file: string, options: { json?: boolean; strictPrivacy?: boolean }) => {
      const document = await readPublication(file);
      const findings = lintPublication(
        document,
        options.strictPrivacy === undefined ? {} : { strictPrivacy: options.strictPrivacy },
      );
      emit({ command: 'lint', file, findings }, options.json === true);
      if (hasErrors(findings)) process.exitCode = 1;
    });

  program
    .command('inspect')
    .argument('<file>', 'local JSON file, or - for stdin')
    .option('--json', 'emit machine-readable JSON')
    .action(async (file: string, options: { json?: boolean }) => {
      const document = await readPublication(file);
      const summary = inspect(document);
      emit({ command: 'inspect', file, summary }, options.json === true);
    });

  program
    .command('check')
    .argument('[target]', 'authoring config, local publication file, or publication directory')
    .option('--config <file>', 'authoring configuration file')
    .option('--output <directory>', 'temporary output directory for a build check')
    .option('--json', 'emit machine-readable JSON')
    .action(
      async (
        target: string | undefined,
        options: { config?: string; output?: string; json?: boolean },
      ) => {
        const selected = options.config ?? target ?? 'eom.config.yaml';
        if (isAuthoringConfigPath(selected)) {
          const report = await buildPublication({
            configFile: selected,
            ...(options.output ? { outputRoot: options.output } : {}),
            dryRun: true,
          });
          emit({ command: 'check', file: selected, report }, options.json === true);
          if (!report.valid) process.exitCode = 1;
          return;
        }
        const file = await resolveLocalPublication(selected);
        const document = await readPublication(file);
        const result = validateDocument(document);
        const findings = lintPublication(document);
        emit({ command: 'check', file, result, findings }, options.json === true);
        if (!result.valid || hasErrors(findings)) process.exitCode = 1;
      },
    );

  program
    .command('fetch')
    .argument('<origin-or-url>', 'HTTPS origin or manifest URL')
    .option('--json', 'emit machine-readable JSON')
    .option('--timeout <milliseconds>', 'request timeout', parseNumberOption)
    .option('--max-bytes <bytes>', 'response byte limit', parseNumberOption)
    .option('--max-redirects <count>', 'redirect limit', parseNumberOption)
    .action(
      async (
        originOrUrl: string,
        options: { json?: boolean; timeout?: number; maxBytes?: number; maxRedirects?: number },
      ) => {
        try {
          const response = await fetchManifest(originOrUrl, {
            ...(options.timeout === undefined ? {} : { timeoutMs: options.timeout }),
            ...(options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes }),
            ...(options.maxRedirects === undefined ? {} : { maxRedirects: options.maxRedirects }),
          });
          const result = validateDocument(response.document);
          emit(
            {
              command: 'fetch',
              file: originOrUrl,
              result,
              summary: {
                requestedUrl: response.requestedUrl,
                finalUrl: response.finalUrl,
                status: response.status,
                redirects: response.redirects,
                observedAt: response.observedAt,
              },
            },
            options.json === true,
          );
          if (!result.valid) process.exitCode = 1;
        } catch (error) {
          const finding = fetchFinding(error);
          emit({ command: 'fetch', file: originOrUrl, findings: [finding] }, options.json === true);
          process.exitCode = 3;
        }
      },
    );

  program
    .command('schema')
    .argument('[schema]', 'registered schema filename or resource type')
    .option('--json', 'emit machine-readable JSON')
    .action(async (schema: string | undefined, options: { json?: boolean }) => {
      if (!schema) {
        emit(
          { command: 'schema', file: 'bundled', summary: { schemas: availableSchemaFiles() } },
          options.json === true,
        );
        return;
      }
      const schemaFile: SchemaFile | undefined =
        schemaFileForType(schema) ??
        (availableSchemaFiles().includes(schema) ? (schema as SchemaFile) : undefined);
      if (!schemaFile) {
        emit(
          {
            command: 'schema',
            file: schema,
            findings: [
              {
                code: 'EOM_SCHEMA_UNKNOWN_TYPE',
                category: 'structural',
                severity: 'error',
                message: `No bundled schema is registered for ${schema}.`,
              },
            ],
          },
          options.json === true,
        );
        process.exitCode = 1;
        return;
      }
      emit(
        { command: 'schema', file: schemaFile, summary: readSchema(schemaFile) },
        options.json === true,
      );
    });

  program
    .command('explain')
    .argument('<finding-code>', 'stable EOM finding code')
    .option('--json', 'emit machine-readable JSON')
    .action(async (code: string, options: { json?: boolean }) => {
      const explanation = explainFinding(code);
      emit({ command: 'explain', file: code, summary: explanation }, options.json === true);
      if (!explanation.known) process.exitCode = 1;
    });

  program
    .command('doctor')
    .argument('[target]', 'authoring config or local publication to inspect')
    .option('--json', 'emit machine-readable JSON')
    .action(async (target: string | undefined, options: { json?: boolean }) => {
      const summary: Record<string, unknown> = {
        cliVersion: '0.1.0',
        node: process.version,
        schemas: availableSchemaFiles().length,
        network: 'not used',
      };
      let valid = true;
      if (target && isAuthoringConfigPath(target)) {
        const report = await buildPublication({ configFile: target, dryRun: true });
        summary.build = report;
        valid = report.valid;
      } else if (target) {
        const file = await resolveLocalPublication(target);
        const document = await readPublication(file);
        const result = validateDocument(document);
        summary.validation = result;
        summary.lint = lintPublication(document);
        valid = result.valid && !hasErrors(summary.lint as readonly Finding[]);
      }
      emit({ command: 'doctor', file: target ?? 'environment', summary }, options.json === true);
      if (!valid) process.exitCode = 1;
    });

  return program;
}

function isAuthoringConfigPath(value: string): boolean {
  const lower = value.toLowerCase();
  return lower.endsWith('.yaml') || lower.endsWith('.yml');
}

function parseAdapterFormat(value: string): AdapterFormat {
  if ((supportedAdapterFormats() as readonly string[]).includes(value)) {
    return value as AdapterFormat;
  }
  throw new Error(
    `Unknown adapter format ${value}. Supported formats: ${supportedAdapterFormats().join(', ')}`,
  );
}

async function readAdapterInput(file: string, format: AdapterFormat): Promise<unknown> {
  const text = await readFile(resolve(file), 'utf8');
  if (
    format === 'qti-xml' ||
    format === 'common-cartridge-xml' ||
    format === 'icalendar' ||
    (format === 'json-feed-rss-atom' && /\.(?:xml|rss|atom)$/iu.test(file))
  ) {
    return text;
  }
  return parseStrictJson(text, file);
}

async function resolveLocalPublication(target: string): Promise<string> {
  const path = resolve(target);
  const information = await stat(path);
  if (!information.isDirectory()) return path;
  for (const candidate of [
    join(path, '.well-known', 'educational-organization-manifest'),
    join(path, '.well-known', 'educational-organization-manifest.json'),
  ]) {
    try {
      const candidateStat = await stat(candidate);
      if (candidateStat.isFile()) return candidate;
    } catch {
      // Try the next conventional publication path.
    }
  }
  throw new Error('No EOM well-known manifest was found in the target directory.');
}

function parseNumberOption(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid numeric option: ${value}`);
  return parsed;
}

function fetchFinding(error: unknown): Finding {
  if (error instanceof EomFetchError) {
    return {
      code: error.code,
      category: 'transport',
      severity: 'error',
      message: error.message,
      ...(error.url ? { resource: error.url } : {}),
    };
  }
  return {
    code: 'EOM_FETCH_NETWORK',
    category: 'transport',
    severity: 'error',
    message: error instanceof Error ? error.message : 'The EOM request failed.',
  };
}

function explainFinding(code: string): Record<string, unknown> {
  const explanations: Record<string, Record<string, string>> = {
    EOM_FETCH_PRIVATE_HOST: {
      category: 'transport',
      summary: 'The target host or a DNS answer is private, local, metadata, or reserved.',
      remediation:
        'Use a public HTTPS origin; local fixtures require an explicit test-only fetch option.',
    },
    EOM_PREREQUISITE_CYCLE: {
      category: 'semantic',
      summary: 'Prerequisite edges form a cycle and cannot describe an executable course sequence.',
      remediation: 'Remove the circular edge or model it as a recommendation.',
    },
    EOM_PRIVACY_PROHIBITED_FIELD: {
      category: 'privacy',
      summary: 'The field is outside EOM public data boundaries.',
      remediation:
        'Remove student/private/sensitive data or replace it with an approved public aggregate or role contact.',
    },
    EOM_REFERENCE_DANGLING: {
      category: 'semantic',
      summary: 'A reference does not resolve in the loaded publication set.',
      remediation: 'Publish the referenced public entity or remove the stale reference.',
    },
  };
  const match = explanations[code];
  return match
    ? { known: true, code, ...match }
    : {
        known: false,
        code,
        category: 'unknown',
        summary: 'No bundled explanation is available for this finding code.',
      };
}

async function readPublication(file: string): Promise<unknown> {
  const text = file === '-' ? await readStdin() : await readFile(resolve(file), 'utf8');
  return parseStrictJson(text, file);
}

async function readJsonArray(file: string): Promise<readonly unknown[]> {
  const value = await readPublication(file);
  if (!Array.isArray(value)) throw new Error(`${file} must contain a JSON array.`);
  return value;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function inspect(document: unknown): Record<string, unknown> {
  if (!isJsonObject(document)) {
    return { type: undefined, id: undefined, resources: 0, capabilities: 0 };
  }
  const resources = Array.isArray(document.resources) ? document.resources : [];
  const capabilities = Array.isArray(document.capabilities) ? document.capabilities : [];
  return {
    type: typeof document.type === 'string' ? document.type : undefined,
    id: typeof document.id === 'string' ? document.id : undefined,
    canonical: typeof document.canonical === 'string' ? document.canonical : undefined,
    organizations: Array.isArray(document.organizations) ? document.organizations.length : 0,
    resources: resources.length,
    resourceTypes: resources
      .filter(isJsonObject)
      .map((resource) => resource.type)
      .filter((type): type is string => typeof type === 'string')
      .sort(),
    capabilities: capabilities.length,
    hasDelegations: Array.isArray(document.delegations) && document.delegations.length > 0,
    hasSignatures:
      isJsonObject(document.signing) &&
      Array.isArray(document.signing.signatures) &&
      document.signing.signatures.length > 0,
  };
}

function emit(output: CliOutput, json: boolean): void {
  if (json) {
    process.stdout.write(stringifyCanonical(output as unknown as never));
    return;
  }
  if (output.result) {
    process.stdout.write(`${output.result.valid ? 'valid' : 'invalid'} ${output.file}\n`);
    printFindings(output.result.findings);
    return;
  }
  if (output.findings) {
    process.stdout.write(
      `${output.findings.length === 0 ? 'clean' : `${output.findings.length} finding(s)`} ${output.file}\n`,
    );
    printFindings(output.findings);
    return;
  }
  if (output.report) {
    process.stdout.write(`${output.report.valid ? 'valid' : 'invalid'} build ${output.file}\n`);
    printFindings(output.report.findings);
    return;
  }
  if (output.conformance) {
    const summary = conformanceReportSummary(output.conformance);
    process.stdout.write(`${output.conformance.status} conformance ${output.file}\n`);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }
  if (output.review) {
    process.stdout.write(`${JSON.stringify(output.review, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(output.summary, null, 2)}\n`);
}

function printFindings(findings: readonly Finding[]): void {
  for (const item of findings) {
    const location = item.pointer ? ` ${item.pointer}` : '';
    process.stdout.write(`${item.severity} ${item.code}${location}: ${item.message}\n`);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  await createCli().parseAsync(process.argv);
}
