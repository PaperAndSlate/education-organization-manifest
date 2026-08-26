import { access, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
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
  migrateDocument,
  parseStrictJson,
  semanticDiff,
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
  renderValidationReport,
  validatePublicationDirectory,
  validatePublicationUrl,
  type PublicationValidationResult,
  type ValidationReportFormat,
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

interface GlobalOptions {
  readonly json?: boolean;
  readonly config?: string;
  readonly deterministic?: boolean;
  readonly offline?: boolean;
  readonly timeout?: number;
  readonly maxBytes?: number;
  readonly cacheDir?: string;
}

export function createCli(): Command {
  const program = new Command();
  program
    .name('eom')
    .description('Validate, lint, and inspect Educational Organization Manifest publications.')
    .version('1.0.0-rc.2 (EOM schema catalog 1.0; protocol 1.0)', '-V, --version')
    .option('--json', 'emit machine-readable JSON')
    .option('--quiet', 'suppress non-error terminal output')
    .option('--verbose', 'include diagnostic details')
    .option('--no-color', 'disable terminal color')
    .option('--offline', 'disable all network access')
    .option('--config <file>', 'default authoring configuration file')
    .option('--cache-dir <directory>', 'bounded cache directory for network operations')
    .option('--timeout <milliseconds>', 'default network timeout', parseNumberOption)
    .option('--max-bytes <bytes>', 'default network response limit', parseNumberOption);

  program
    .command('init')
    .argument('[directory]', 'starter project directory', '.')
    .option('--template <template>', 'minimal-school, district, or rich-school', 'minimal-school')
    .option('--language <language>', 'default BCP 47 language', 'en-US')
    .option('--origin <origin>', 'public HTTPS origin', 'https://school.example')
    .option('--modules <modules>', 'comma-separated optional module names')
    .option('--force', 'update only the starter files in an existing EOM project')
    .option('--json', 'emit machine-readable JSON')
    .action(
      async (
        directory: string,
        options: {
          template: string;
          language: string;
          origin: string;
          modules?: string;
          force?: boolean;
          json?: boolean;
        },
      ) => {
        const result = await initProject(directory, options);
        emit(
          { command: 'init', file: directory, summary: result },
          jsonOutput(program, options.json),
        );
      },
    );

  program
    .command('build')
    .argument('[config]', 'authoring configuration file')
    .option('--config <file>', 'authoring configuration file')
    .option('--output <directory>', 'generated public output directory')
    .option('--dry-run', 'validate and report without writing output')
    .option('--module <module>', 'build one registered module plus organization')
    .option('--organization <uri>', 'select an organization identifier')
    .option('--deterministic', 'use a fixed clock when no clock is injected')
    .option('--report <file>', 'write the build report to a file')
    .option('--json', 'emit machine-readable JSON')
    .action(
      async (
        configArgument: string | undefined,
        options: {
          config?: string;
          output?: string;
          dryRun?: boolean;
          module?: string;
          organization?: string;
          deterministic?: boolean;
          report?: string;
          json?: boolean;
        },
      ) => {
        const globalOptions = program.opts<GlobalOptions>();
        const configFile =
          options.config ?? configArgument ?? globalOptions.config ?? 'eom.config.yaml';
        const report = await buildPublication({
          configFile,
          ...(options.output ? { outputRoot: options.output } : {}),
          dryRun: options.dryRun === true,
          ...(options.module ? { module: options.module } : {}),
          ...(options.organization ? { organization: options.organization } : {}),
          ...(options.deterministic || globalOptions.deterministic === true
            ? { deterministic: true }
            : {}),
        });
        if (options.report) {
          await writeFile(resolve(options.report), stringifyCanonical(report as never), 'utf8');
        }
        emit(
          {
            command: 'build',
            file: configFile,
            report,
          },
          jsonOutput(program, options.json),
        );
        if (!report.valid) process.exitCode = 1;
      },
    );

  program
    .command('diff')
    .argument('<before>', 'older local JSON resource')
    .argument('<after>', 'newer local JSON resource')
    .option('--output <file>', 'write the diff report to a file')
    .option('--json', 'emit machine-readable JSON')
    .action(
      async (
        beforeFile: string,
        afterFile: string,
        options: { output?: string; json?: boolean },
      ) => {
        const before = await readPublication(beforeFile);
        const after = await readPublication(afterFile);
        const result = semanticDiff(before, after);
        if (options.output) {
          await writeFile(resolve(options.output), stringifyCanonical(result as never), 'utf8');
        }
        emit(
          {
            command: 'diff',
            file: `${beforeFile} -> ${afterFile}`,
            summary: {
              ...result,
              ...(options.output ? { output: resolve(options.output) } : {}),
            },
          },
          jsonOutput(program, options.json),
        );
        if (result.breaking) process.exitCode = 1;
      },
    );

  program
    .command('migrate')
    .argument('<file>', 'local JSON resource to migrate')
    .requiredOption('--from <version>', 'source EOM version')
    .option('--to <version>', 'target EOM version', '1.0')
    .option('--output <file>', 'write migrated JSON; stdout remains a report')
    .option('--json', 'emit machine-readable JSON')
    .action(
      async (
        file: string,
        options: { from: string; to: string; output?: string; json?: boolean },
      ) => {
        const result = migrateDocument(await readPublication(file), options.from, options.to);
        if (options.output) {
          await writeFile(resolve(options.output), stringifyCanonical(result.document), 'utf8');
        }
        emit(
          {
            command: 'migrate',
            file,
            summary: {
              fromVersion: result.fromVersion,
              toVersion: result.toVersion,
              changed: result.changed,
              notes: result.notes,
              ...(options.output ? { output: resolve(options.output) } : {}),
            },
          },
          jsonOutput(program, options.json),
        );
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
          jsonOutput(program, options.json),
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
          jsonOutput(program, options.json),
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
          jsonOutput(program, options.json),
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
        emit(
          { command: 'candidate', file: workspaceFile, review },
          jsonOutput(program, options.json),
        );
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
          jsonOutput(program, options.json),
        );
        if (report.status === 'non-conforming') process.exitCode = 1;
      },
    );

  program
    .command('validate')
    .argument('<target>', 'local JSON file, publication directory, HTTPS URL, or - for stdin')
    .option('--json', 'emit machine-readable JSON')
    .option('--no-semantic', 'skip semantic validation')
    .option('--format <format>', 'json, sarif, junit, html, or conformance')
    .option('--output <file>', 'write the selected report format to a file')
    .option('--no-graph', 'validate only the root document for URL targets')
    .option('--max-files <count>', 'maximum local graph files', parseNumberOption)
    .option('--max-resources <count>', 'maximum fetched graph resources', parseNumberOption)
    .option('--max-depth <count>', 'maximum fetched graph depth', parseNumberOption)
    .option('--max-total-bytes <bytes>', 'maximum combined graph response bytes', parseNumberOption)
    .action(
      async (
        target: string,
        options: {
          json?: boolean;
          semantic?: boolean;
          format?: string;
          output?: string;
          graph?: boolean;
          maxFiles?: number;
          maxResources?: number;
          maxDepth?: number;
          maxTotalBytes?: number;
        },
      ) => {
        const format = options.format ? parseReportFormat(options.format) : undefined;
        const validationOptions = {
          ...(options.semantic === undefined ? {} : { semantic: options.semantic }),
          ...(options.maxFiles === undefined ? {} : { maxFiles: options.maxFiles }),
          ...(options.maxResources === undefined ? {} : { maxResources: options.maxResources }),
          ...(options.maxDepth === undefined ? {} : { maxDepth: options.maxDepth }),
          ...(options.maxTotalBytes === undefined ? {} : { maxTotalBytes: options.maxTotalBytes }),
        };
        if (isUrlTarget(target)) {
          const globalOptions = program.opts<GlobalOptions>();
          if (globalOptions.offline === true) {
            throw new EomFetchError(
              'EOM_FETCH_NETWORK',
              'Offline mode prevents URL validation.',
              target,
            );
          }
          const publication = await validatePublicationUrl(target, {
            ...validationOptions,
            ...(options.graph === undefined ? {} : { fetchGraph: options.graph }),
            fetch: {
              ...(globalOptions.timeout === undefined ? {} : { timeoutMs: globalOptions.timeout }),
              ...(globalOptions.maxBytes === undefined ? {} : { maxBytes: globalOptions.maxBytes }),
              ...(globalOptions.cacheDir ? { cacheDirectory: globalOptions.cacheDir } : {}),
            },
          });
          await emitPublicationReport(
            target,
            publication,
            format,
            options.output,
            jsonOutput(program, options.json),
          );
          if (!publication.valid) process.exitCode = 1;
          return;
        }
        const information = target === '-' ? undefined : await stat(resolve(target));
        if (information?.isDirectory()) {
          const publication = await validatePublicationDirectory(target, validationOptions);
          await emitPublicationReport(
            target,
            publication,
            format,
            options.output,
            jsonOutput(program, options.json),
          );
          if (!publication.valid) process.exitCode = 1;
          return;
        }
        const document = await readPublication(target);
        const result = validateDocument(document, validationOptions);
        if (format || options.output) {
          await writeReport(renderValidationReport(result, format ?? 'json'), options.output);
        } else {
          emit({ command: 'validate', file: target, result }, jsonOutput(program, options.json));
        }
        if (!result.valid) process.exitCode = 1;
      },
    );

  program
    .command('lint')
    .argument('<target>', 'local JSON file, publication directory, HTTPS URL, or - for stdin')
    .option('--json', 'emit machine-readable JSON')
    .option('--strict-privacy', 'treat privacy findings as errors')
    .option('--format <format>', 'json, sarif, junit, html, or conformance')
    .option('--output <file>', 'write the selected report format to a file')
    .option('--no-graph', 'lint only the root document for URL targets')
    .option('--max-files <count>', 'maximum local graph files', parseNumberOption)
    .option('--max-resources <count>', 'maximum fetched graph resources', parseNumberOption)
    .option('--max-depth <count>', 'maximum fetched graph depth', parseNumberOption)
    .option('--max-total-bytes <bytes>', 'maximum combined graph response bytes', parseNumberOption)
    .action(
      async (
        target: string,
        options: {
          json?: boolean;
          strictPrivacy?: boolean;
          format?: string;
          output?: string;
          graph?: boolean;
          maxFiles?: number;
          maxResources?: number;
          maxDepth?: number;
          maxTotalBytes?: number;
        },
      ) => {
        const format = options.format ? parseReportFormat(options.format) : undefined;
        const validationOptions = {
          ...(options.maxFiles === undefined ? {} : { maxFiles: options.maxFiles }),
          ...(options.maxResources === undefined ? {} : { maxResources: options.maxResources }),
          ...(options.maxDepth === undefined ? {} : { maxDepth: options.maxDepth }),
          ...(options.maxTotalBytes === undefined ? {} : { maxTotalBytes: options.maxTotalBytes }),
        };
        let findings: readonly Finding[];
        if (isUrlTarget(target)) {
          const globalOptions = program.opts<GlobalOptions>();
          if (globalOptions.offline === true) {
            throw new EomFetchError(
              'EOM_FETCH_NETWORK',
              'Offline mode prevents URL linting.',
              target,
            );
          }
          const publication = await validatePublicationUrl(target, {
            ...validationOptions,
            ...(options.graph === undefined ? {} : { fetchGraph: options.graph }),
            fetch: {
              ...(globalOptions.timeout === undefined ? {} : { timeoutMs: globalOptions.timeout }),
              ...(globalOptions.maxBytes === undefined ? {} : { maxBytes: globalOptions.maxBytes }),
              ...(globalOptions.cacheDir ? { cacheDirectory: globalOptions.cacheDir } : {}),
            },
          });
          findings = [
            ...publication.findings,
            ...lintDocuments(publication.documents, options.strictPrivacy),
          ];
          const report = { ...publication, valid: !hasErrors(findings), findings };
          if (format || options.output) {
            await writeReport(renderValidationReport(report, format ?? 'json'), options.output);
          } else {
            emit({ command: 'lint', file: target, findings }, jsonOutput(program, options.json));
          }
        } else {
          const information = target === '-' ? undefined : await stat(resolve(target));
          if (information?.isDirectory()) {
            const publication = await validatePublicationDirectory(target, validationOptions);
            findings = [
              ...publication.findings,
              ...lintDocuments(publication.documents, options.strictPrivacy),
            ];
            const report = { ...publication, valid: !hasErrors(findings), findings };
            if (format || options.output) {
              await writeReport(renderValidationReport(report, format ?? 'json'), options.output);
            } else {
              emit({ command: 'lint', file: target, findings }, jsonOutput(program, options.json));
            }
          } else {
            const document = await readPublication(target);
            findings = lintPublication(
              document,
              options.strictPrivacy === undefined ? {} : { strictPrivacy: options.strictPrivacy },
            );
            if (format || options.output) {
              await writeReport(
                renderValidationReport(
                  {
                    valid: !hasErrors(findings),
                    structuralValid: true,
                    semanticValid: true,
                    findings,
                  },
                  format ?? 'json',
                ),
                options.output,
              );
            } else {
              emit({ command: 'lint', file: target, findings }, jsonOutput(program, options.json));
            }
          }
        }
        if (hasErrors(findings)) process.exitCode = 1;
      },
    );

  program
    .command('inspect')
    .argument('<file>', 'local JSON file, or - for stdin')
    .option('--json', 'emit machine-readable JSON')
    .action(async (file: string, options: { json?: boolean }) => {
      const document = await readPublication(file);
      const summary = inspect(document);
      emit({ command: 'inspect', file, summary }, jsonOutput(program, options.json));
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
          const temporary = options.output
            ? undefined
            : await mkdtemp(join(tmpdir(), 'eom-check-'));
          const output = options.output ?? temporary;
          try {
            const report = await buildPublication({
              configFile: selected,
              ...(output ? { outputRoot: output } : {}),
              ...(temporary ? { allowExternalOutput: true } : {}),
            });
            const publication =
              report.written && output ? await validatePublicationDirectory(output) : undefined;
            const findings = publication
              ? [...report.findings, ...publication.findings]
              : report.findings;
            emit(
              {
                command: 'check',
                file: selected,
                report: {
                  ...report,
                  valid: report.valid && (publication?.valid ?? true),
                  findings,
                },
                ...(publication ? { summary: { files: publication.files } } : {}),
              },
              jsonOutput(program, options.json),
            );
            if (!report.valid || publication?.valid === false) process.exitCode = 1;
          } finally {
            if (temporary) await rm(temporary, { recursive: true, force: true });
          }
          return;
        }
        const selectedPath = resolve(selected);
        const selectedInformation = await stat(selectedPath);
        const file = selectedInformation.isDirectory()
          ? selectedPath
          : await resolveLocalPublication(selected);
        const information = selectedInformation.isDirectory()
          ? selectedInformation
          : await stat(file);
        if (information.isDirectory()) {
          const publication = await validatePublicationDirectory(file);
          const findings = [
            ...publication.findings,
            ...lintDocuments(publication.documents, undefined),
          ];
          emit(
            { command: 'check', file, findings, summary: { files: publication.files } },
            jsonOutput(program, options.json),
          );
          if (!publication.valid || hasErrors(findings)) process.exitCode = 1;
        } else {
          const document = await readPublication(file);
          const result = validateDocument(document);
          const findings = lintPublication(document);
          emit({ command: 'check', file, result, findings }, jsonOutput(program, options.json));
          if (!result.valid || hasErrors(findings)) process.exitCode = 1;
        }
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
          const globalOptions = program.opts<GlobalOptions>();
          const response = await fetchManifest(originOrUrl, {
            ...(options.timeout === undefined
              ? globalOptions.timeout === undefined
                ? {}
                : { timeoutMs: globalOptions.timeout }
              : { timeoutMs: options.timeout }),
            ...(options.maxBytes === undefined
              ? globalOptions.maxBytes === undefined
                ? {}
                : { maxBytes: globalOptions.maxBytes }
              : { maxBytes: options.maxBytes }),
            ...(options.maxRedirects === undefined ? {} : { maxRedirects: options.maxRedirects }),
            ...(globalOptions.cacheDir ? { cacheDirectory: globalOptions.cacheDir } : {}),
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
            jsonOutput(program, options.json),
          );
          if (!result.valid) process.exitCode = 1;
        } catch (error) {
          const finding = fetchFinding(error);
          emit(
            { command: 'fetch', file: originOrUrl, findings: [finding] },
            jsonOutput(program, options.json),
          );
          process.exitCode = 3;
        }
      },
    );

  program
    .command('schema')
    .argument('[schema]', 'registered schema filename or resource type')
    .option('--json', 'emit machine-readable JSON')
    .action((schema: string | undefined, options: { json?: boolean }) => {
      if (!schema) {
        emit(
          { command: 'schema', file: 'bundled', summary: { schemas: availableSchemaFiles() } },
          jsonOutput(program, options.json),
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
          jsonOutput(program, options.json),
        );
        process.exitCode = 1;
        return;
      }
      emit(
        { command: 'schema', file: schemaFile, summary: readSchema(schemaFile) },
        jsonOutput(program, options.json),
      );
    });

  program
    .command('explain')
    .argument('<finding-code>', 'stable EOM finding code')
    .option('--json', 'emit machine-readable JSON')
    .action((code: string, options: { json?: boolean }) => {
      const explanation = explainFinding(code);
      emit(
        { command: 'explain', file: code, summary: explanation },
        jsonOutput(program, options.json),
      );
      if (!explanation.known) process.exitCode = 1;
    });

  program
    .command('doctor')
    .argument('[target]', 'authoring config or local publication to inspect')
    .option('--json', 'emit machine-readable JSON')
    .action(async (target: string | undefined, options: { json?: boolean }) => {
      const summary: Record<string, unknown> = {
        cliVersion: '1.0.0-rc.2',
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
      emit(
        { command: 'doctor', file: target ?? 'environment', summary },
        jsonOutput(program, options.json),
      );
      if (!valid) process.exitCode = 1;
    });

  return program;
}

function isUrlTarget(value: string): boolean {
  return /^https?:\/\//iu.test(value);
}

function parseReportFormat(value: string): ValidationReportFormat {
  const supported: readonly ValidationReportFormat[] = [
    'json',
    'sarif',
    'junit',
    'html',
    'conformance',
  ];
  if (supported.includes(value as ValidationReportFormat)) {
    return value as ValidationReportFormat;
  }
  throw new Error(`Unknown report format ${value}. Supported formats: ${supported.join(', ')}`);
}

async function emitPublicationReport(
  file: string,
  publication: PublicationValidationResult,
  format: ValidationReportFormat | undefined,
  output: string | undefined,
  json: boolean,
): Promise<void> {
  if (format || output) {
    await writeReport(renderValidationReport(publication, format ?? 'json'), output);
    return;
  }
  emit(
    {
      command: 'validate',
      file,
      summary: {
        valid: publication.valid,
        structuralValid: publication.structuralValid,
        semanticValid: publication.semanticValid,
        files: publication.files,
        findings: publication.findings,
        ...(publication.rootUrl ? { rootUrl: publication.rootUrl } : {}),
      },
    },
    json,
  );
}

function lintDocuments(
  documents: Readonly<Record<string, unknown>>,
  strictPrivacy: boolean | undefined,
): Finding[] {
  const result: Finding[] = [];
  for (const [resource, document] of Object.entries(documents)) {
    const findings = lintPublication(
      document,
      strictPrivacy === undefined ? {} : { strictPrivacy },
    );
    result.push(...findings.map((item) => ({ ...item, resource: item.resource ?? resource })));
  }
  return result;
}

async function writeReport(content: string, output: string | undefined): Promise<void> {
  if (output) {
    await writeFile(resolve(output), content, 'utf8');
    return;
  }
  process.stdout.write(content);
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

async function initProject(
  directory: string,
  options: {
    readonly template: string;
    readonly language: string;
    readonly origin: string;
    readonly modules?: string;
    readonly force?: boolean;
  },
): Promise<Record<string, unknown>> {
  const templates = new Set(['minimal-school', 'district', 'rich-school']);
  if (!templates.has(options.template)) {
    throw new Error(
      `Unknown init template ${options.template}. Choose minimal-school, district, or rich-school.`,
    );
  }
  if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(options.language)) {
    throw new Error(`Invalid BCP 47 language ${options.language}.`);
  }
  const origin = validateInitOrigin(options.origin);
  const target = resolve(directory);
  let existing: readonly string[] = [];
  try {
    existing = (await readdir(target)).sort();
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  const starterFiles = [
    'eom.config.yaml',
    'source/organization.yaml',
    'source/contacts.yaml',
    'source/README.md',
  ];
  if (existing.length > 0 && options.force !== true) {
    throw new Error(
      `Refusing to initialize non-empty directory ${target}; use --force only for starter files.`,
    );
  }
  await mkdir(join(target, 'source'), { recursive: true });
  const name = templateName(options.template, basename(target));
  const requestedModules = (options.modules ?? 'organization,contacts')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const unsupportedModules = requestedModules.filter(
    (value) => !['organization', 'contacts'].includes(value),
  );
  const config = [
    `# Generated by eom init (${options.template})`,
    'project:',
    `  name: ${yamlQuote(name)}`,
    '  protocolVersion: "1.0"',
    `  defaultLanguage: ${yamlQuote(options.language)}`,
    'publisher:',
    `  origin: ${yamlQuote(origin)}`,
    '  manifestPath: /.well-known/educational-organization-manifest',
    'source:',
    '  root: source',
    '  modules:',
    '    organization:',
    '      - organization.yaml',
    '    contacts:',
    '      - contacts.yaml',
    'output:',
    '  root: generated/public',
    'validation:',
    '  privacyLint: true',
    '  failOn: [error]',
    'signing:',
    '  enabled: false',
    '',
  ].join('\n');
  const organization = [
    `id: ${origin}/id/school`,
    'type: secondary-school',
    'organizationType: secondary-school',
    `name: ${yamlQuote(name)}`,
    `canonical: ${origin}/eom/organization.json`,
    `website: ${origin}/`,
    'status: active',
    '',
  ].join('\n');
  const contacts = [
    `id: ${origin}/id/contact/admissions`,
    'role: Admissions office',
    `email: admissions@${new URL(origin).hostname}`,
    `website: ${origin}/admissions`,
    '',
  ].join('\n');
  const readme = [
    `# ${name}`,
    '',
    'This fictional starter project was created by `eom init`. Add reviewed public source data under `source/` and run `eom check eom.config.yaml` before publishing.',
    '',
    `Selected template: ${options.template}`,
    `Requested modules: ${requestedModules.join(', ')}`,
    ...(unsupportedModules.length > 0
      ? [`Module source templates not included yet: ${unsupportedModules.join(', ')}.`]
      : []),
    'All example identifiers use the configured origin; replace them only with identifiers you control.',
    '',
  ].join('\n');
  const files: Record<string, string> = {
    'eom.config.yaml': config,
    'source/organization.yaml': organization,
    'source/contacts.yaml': contacts,
    'source/README.md': readme,
  };
  const written: string[] = [];
  const skipped: string[] = [];
  for (const file of starterFiles) {
    const path = join(target, file);
    try {
      await access(path);
      skipped.push(file);
    } catch {
      await writeFile(path, files[file] ?? '', 'utf8');
      written.push(file);
    }
  }
  return {
    directory: target,
    template: options.template,
    origin,
    language: options.language,
    requestedModules,
    unsupportedModules,
    written,
    skipped,
  };
}

function validateInitOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('The init origin must be a valid HTTPS URL.');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      'The init origin must be an HTTPS origin without credentials, path, query, or fragment.',
    );
  }
  return parsed.origin;
}

function templateName(template: string, fallback: string): string {
  if (template === 'district')
    return fallback ? `${fallback} School District` : 'Example School District';
  if (template === 'rich-school')
    return fallback ? `${fallback} High School` : 'Example High School';
  return fallback ? `${fallback} School` : 'Example School';
}

function yamlQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
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

function jsonOutput(program: Command, local: boolean | undefined): boolean {
  return local === true || program.opts<GlobalOptions>().json === true;
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
  return value.map((item: unknown) => item);
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
