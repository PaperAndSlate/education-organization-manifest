import { lstat, mkdir, mkdtemp, open, readdir, realpath, rename, rm, stat } from 'node:fs/promises';
import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { Command, CommanderError } from 'commander';
import { buildReviewReport, detectConflicts, type ReviewReport } from '@paperandslate/eom-agentic';
import { mapInput, supportedAdapterFormats, type AdapterFormat } from '@paperandslate/eom-adapters';
import {
  buildPublication,
  GeneratorInputError,
  loadAuthoringConfig,
  type BuildMode,
  type BuildReport,
} from '@paperandslate/eom-generator';
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
  StrictJsonError,
  discoveryUrl,
  fetchEom,
  fetchManifest,
  isJsonObject,
  migrateDocument,
  parseStrictJson,
  semanticDiff,
  stringifyCanonical,
  type FetchOptions,
} from '@paperandslate/eom-core';
import { normalizeFsPath } from '@paperandslate/eom-core/fs-path';
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
  type PublicationFetchRecord,
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

const MAX_CLI_INPUT_BYTES = 32 * 1024 * 1024;

let activeProgram: Command | undefined;

interface GlobalOptions {
  readonly json?: boolean;
  readonly quiet?: boolean;
  readonly verbose?: boolean;
  readonly color?: boolean;
  readonly config?: string;
  readonly deterministic?: boolean;
  readonly offline?: boolean;
  readonly timeout?: number;
  readonly maxBytes?: number;
  readonly maxRedirects?: number;
  readonly cacheDir?: string;
}

export function createCli(): Command {
  const program = new Command();
  activeProgram = program;
  program.exitOverride();
  program
    .name('eom')
    .description('Validate, lint, and inspect Educational Organization Manifest publications.')
    .version('1.0.0-rc.3 (EOM schema catalog 1.0; protocol 1.0)', '-V, --version')
    .option('--json', 'emit machine-readable JSON')
    .option('--quiet', 'suppress non-error terminal output')
    .option('--verbose', 'include diagnostic details')
    .option('--no-color', 'disable terminal color')
    .option('--offline', 'disable all network access')
    .option('--config <file>', 'default authoring configuration file')
    .option('--cache-dir <directory>', 'bounded cache directory for network operations')
    .option('--deterministic', 'use a fixed clock for deterministic output')
    .option('--timeout <milliseconds>', 'default network timeout', parseNumberOption)
    .option('--max-bytes <bytes>', 'default network response limit', parseNumberOption)
    .option('--max-redirects <count>', 'default redirect limit', parseNumberOption);
  applyUserOptions(program);
  applyEnvironmentOptions(program);

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
    .option('--mode <mode>', 'full, module, organization, or changed-files build mode')
    .option('--module <module>', 'build one registered module plus organization')
    .option('--organization <uri>', 'select an organization identifier')
    .option(
      '--changed <source-path>',
      'repeatable source path for a changed-files build (relative to the config directory)',
      collectOption,
      [],
    )
    .option('--allow-external-output', 'allow an explicitly selected output outside the project')
    .option('--sign', 'enable configured detached signing for this build')
    .option('--deterministic', 'use a fixed clock when no clock is injected')
    .option('--verify-deterministic', 'build isolated outputs twice and compare every byte')
    .option('--report <file>', 'write the build report to a file')
    .option('--json', 'emit machine-readable JSON')
    .action(
      async (
        configArgument: string | undefined,
        options: {
          config?: string;
          output?: string;
          dryRun?: boolean;
          mode?: string;
          module?: string;
          organization?: string;
          changed?: string[];
          allowExternalOutput?: boolean;
          sign?: boolean;
          deterministic?: boolean;
          verifyDeterministic?: boolean;
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
          ...(options.mode ? { mode: parseBuildMode(options.mode) } : {}),
          ...(options.module ? { module: options.module } : {}),
          ...(options.organization ? { organization: options.organization } : {}),
          ...(options.changed && options.changed.length > 0
            ? { changedFiles: options.changed }
            : {}),
          ...(options.allowExternalOutput ? { allowExternalOutput: true } : {}),
          ...(options.sign ? { sign: true } : {}),
          ...(globalOptions.cacheDir ? { cacheDirectory: globalOptions.cacheDir } : {}),
          ...(options.deterministic || globalOptions.deterministic === true
            ? { deterministic: true }
            : {}),
          ...(options.verifyDeterministic ? { verifyDeterministic: true } : {}),
        });
        if (options.report) {
          await writeBuildReport(options.report, stringifyCanonical(report as never), report);
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
          await writeOutputFile(options.output, stringifyCanonical(result as never));
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
          await writeOutputFile(options.output, stringifyCanonical(result.document));
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
    .option('--expires <date-time>', 'optional signature expiry date-time')
    .option('--output <file>', 'detached signature output file')
    .option('--json', 'emit machine-readable JSON')
    .action(
      async (
        file: string,
        options: {
          key: string;
          keyId: string;
          expires?: string;
          output?: string;
          json?: boolean;
        },
      ) => {
        const document = await readPublication(file);
        const privateKey = await readTextInput(options.key);
        const signature = signDetached(document, {
          privateKey,
          keyId: options.keyId,
          ...(options.expires ? { expires: options.expires } : {}),
        });
        if (options.output) {
          await writeOutputFile(options.output, `${JSON.stringify(signature, null, 2)}\n`);
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
    .option(
      '--authority-resource <file>',
      'declared manifest resource descriptor for authority evaluation',
    )
    .option('--resource-url <url>', 'retrieved resource URL for authority evaluation')
    .option('--observed-root-url <url>', 'observed root-manifest URL for origin binding')
    .option('--json', 'emit machine-readable JSON')
    .action(
      async (
        file: string,
        options: {
          signature: string;
          keySet: string;
          manifest?: string;
          authorityResource?: string;
          resourceUrl?: string;
          observedRootUrl?: string;
          json?: boolean;
        },
      ) => {
        if (
          (options.manifest === undefined) !== (options.resourceUrl === undefined) ||
          (options.authorityResource !== undefined && options.manifest === undefined) ||
          (options.observedRootUrl !== undefined && options.manifest === undefined) ||
          (options.manifest !== undefined &&
            (options.authorityResource === undefined || options.observedRootUrl === undefined))
        ) {
          throw new CliUsageError(
            'Authority verification requires --manifest, --resource-url, --authority-resource, and --observed-root-url together; --authority-resource and --observed-root-url require --manifest.',
          );
        }
        const document = await readPublication(file);
        const signature = await readPublication(options.signature);
        const keySet = await readPublication(options.keySet);
        const manifest = options.manifest ? await readPublication(options.manifest) : undefined;
        const authorityResource = options.authorityResource
          ? await readPublication(options.authorityResource)
          : undefined;
        const result = verifyDetached(document, signature, keySet, {
          ...(manifest === undefined || options.resourceUrl === undefined
            ? {}
            : {
                manifest,
                resource: document,
                finalUrl: options.resourceUrl,
                ...(authorityResource === undefined ? {} : { authorityResource }),
                ...(options.observedRootUrl === undefined
                  ? {}
                  : { observedRootUrl: options.observedRootUrl }),
              }),
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
    .option('--implementation-source <uri>', 'implementation source URI recorded in the report')
    .option('--mode <mode>', 'fixture, publisher, consumer, or generator execution mode')
    .option('--origin <origin>', 'publisher origin used by publisher mode')
    .option(
      '--fixture-authority-origin <origin>',
      'fictional HTTPS origin represented by fixture files',
    )
    .option('--max-files <count>', 'maximum captured files', parseNumberOption)
    .option('--max-total-bytes <bytes>', 'maximum captured bytes', parseNumberOption)
    .option('--max-depth <count>', 'maximum captured directory depth', parseNumberOption)
    .option('--output <file>', 'write the canonical machine-readable report to a local file')
    .option('--json', 'emit machine-readable JSON')
    .action(
      async (
        directory: string,
        options: {
          profile: string;
          implementation?: string;
          implementationVersion?: string;
          implementationSource?: string;
          mode?: string;
          origin?: string;
          fixtureAuthorityOrigin?: string;
          maxFiles?: number;
          maxTotalBytes?: number;
          maxDepth?: number;
          output?: string;
          json?: boolean;
        },
      ) => {
        if (!isConformanceProfileName(options.profile)) {
          throw new CliUsageError(`Unknown conformance profile ${options.profile}.`);
        }
        const globalOptions = program.opts<GlobalOptions>();
        if (
          globalOptions.offline === true &&
          (options.origin !== undefined || options.mode === 'publisher')
        ) {
          throw new EomFetchError(
            'EOM_FETCH_NETWORK',
            'Offline mode prevents publisher conformance network checks.',
            options.origin,
          );
        }
        const report = await runConformance({
          directory,
          profile: options.profile,
          ...(options.mode ? { mode: parseConformanceMode(options.mode) } : {}),
          ...(options.origin ? { origin: options.origin } : {}),
          ...(options.implementation ? { implementationName: options.implementation } : {}),
          ...(options.implementationVersion
            ? { implementationVersion: options.implementationVersion }
            : {}),
          ...(options.implementationSource
            ? { implementationSource: options.implementationSource }
            : {}),
          ...(options.fixtureAuthorityOrigin
            ? { fixtureAuthorityOrigin: options.fixtureAuthorityOrigin }
            : {}),
          ...(options.maxFiles === undefined ? {} : { maxFiles: options.maxFiles }),
          ...(options.maxTotalBytes === undefined ? {} : { maxTotalBytes: options.maxTotalBytes }),
          ...(options.maxDepth === undefined ? {} : { maxDepth: options.maxDepth }),
          fetch: deploymentFetchOptions(globalOptions),
        });
        if (options.output) {
          await writeOutputFile(options.output, stringifyCanonical(report as never));
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
    .argument('[target]', 'local JSON file, publication directory, HTTPS URL, or - for stdin')
    .option('--origin <origin>', 'explicit HTTPS origin or manifest URL to validate')
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
        target: string | undefined,
        options: {
          origin?: string;
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
        const selectedTarget = options.origin ?? target;
        if (!selectedTarget) throw new CliUsageError('Provide a target or --origin.');
        const format = options.format ? parseReportFormat(options.format) : undefined;
        if (isAuthoringConfigPath(selectedTarget)) {
          const result = await validateAuthoringProject(
            selectedTarget,
            program.opts<GlobalOptions>().deterministic === true,
          );
          if (format || options.output) {
            await writeReport(renderValidationReport(result, format ?? 'json'), options.output);
          } else {
            emit(
              { command: 'validate', file: selectedTarget, result },
              jsonOutput(program, options.json),
            );
          }
          if (!result.valid) process.exitCode = 1;
          return;
        }
        const globalOptions = program.opts<GlobalOptions>();
        const validationOptions = {
          ...(options.semantic === undefined ? {} : { semantic: options.semantic }),
          ...(options.maxFiles === undefined ? {} : { maxFiles: options.maxFiles }),
          ...(options.maxResources === undefined ? {} : { maxResources: options.maxResources }),
          ...(options.maxDepth === undefined ? {} : { maxDepth: options.maxDepth }),
          ...(options.maxTotalBytes === undefined ? {} : { maxTotalBytes: options.maxTotalBytes }),
          ...(globalOptions.maxBytes === undefined ? {} : { maxBytes: globalOptions.maxBytes }),
        };
        if (isOriginTarget(selectedTarget)) {
          if (globalOptions.offline === true) {
            throw new EomFetchError(
              'EOM_FETCH_NETWORK',
              'Offline mode prevents URL validation.',
              selectedTarget,
            );
          }
          const publication = await validatePublicationUrl(selectedTarget, {
            ...validationOptions,
            ...(options.graph === undefined ? {} : { fetchGraph: options.graph }),
            fetch: {
              ...(globalOptions.timeout === undefined ? {} : { timeoutMs: globalOptions.timeout }),
              ...(globalOptions.maxBytes === undefined ? {} : { maxBytes: globalOptions.maxBytes }),
              ...(globalOptions.maxRedirects === undefined
                ? {}
                : { maxRedirects: globalOptions.maxRedirects }),
              ...(globalOptions.cacheDir ? { cacheDirectory: globalOptions.cacheDir } : {}),
            },
          });
          await emitPublicationReport(
            selectedTarget,
            publication,
            format,
            options.output,
            jsonOutput(program, options.json),
          );
          if (!publication.valid) process.exitCode = 1;
          return;
        }
        const information =
          selectedTarget === '-' ? undefined : await stat(resolve(selectedTarget));
        if (information?.isDirectory()) {
          const publication = await validatePublicationDirectory(selectedTarget, validationOptions);
          await emitPublicationReport(
            selectedTarget,
            publication,
            format,
            options.output,
            jsonOutput(program, options.json),
          );
          if (!publication.valid) process.exitCode = 1;
          return;
        }
        const document = await readPublication(selectedTarget);
        const result = validateDocument(document, validationOptions);
        if (format || options.output) {
          await writeReport(renderValidationReport(result, format ?? 'json'), options.output);
        } else {
          emit(
            { command: 'validate', file: selectedTarget, result },
            jsonOutput(program, options.json),
          );
        }
        if (!result.valid) process.exitCode = 1;
      },
    );

  program
    .command('lint')
    .argument('[target]', 'local JSON file, publication directory, HTTPS URL, or - for stdin')
    .option('--origin <origin>', 'explicit HTTPS origin or manifest URL to lint')
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
        target: string | undefined,
        options: {
          origin?: string;
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
        const selectedTarget = options.origin ?? target;
        if (!selectedTarget) throw new CliUsageError('Provide a target or --origin.');
        const format = options.format ? parseReportFormat(options.format) : undefined;
        if (isAuthoringConfigPath(selectedTarget)) {
          const result = await validateAuthoringProject(
            selectedTarget,
            program.opts<GlobalOptions>().deterministic === true,
          );
          const findings = options.strictPrivacy
            ? result.findings.map((item) =>
                item.category === 'privacy' && item.severity === 'warning'
                  ? { ...item, severity: 'error' as const }
                  : item,
              )
            : result.findings;
          const lintResult: ValidationResult = {
            ...result,
            valid: !hasErrors(findings),
            findings,
          };
          if (format || options.output) {
            await writeReport(renderValidationReport(lintResult, format ?? 'json'), options.output);
          } else {
            emit(
              { command: 'lint', file: selectedTarget, findings },
              jsonOutput(program, options.json),
            );
          }
          if (hasErrors(findings)) process.exitCode = 1;
          return;
        }
        const globalOptions = program.opts<GlobalOptions>();
        const validationOptions = {
          ...(options.maxFiles === undefined ? {} : { maxFiles: options.maxFiles }),
          ...(options.maxResources === undefined ? {} : { maxResources: options.maxResources }),
          ...(options.maxDepth === undefined ? {} : { maxDepth: options.maxDepth }),
          ...(options.maxTotalBytes === undefined ? {} : { maxTotalBytes: options.maxTotalBytes }),
          ...(globalOptions.maxBytes === undefined ? {} : { maxBytes: globalOptions.maxBytes }),
        };
        let findings: readonly Finding[];
        if (isOriginTarget(selectedTarget)) {
          if (globalOptions.offline === true) {
            throw new EomFetchError(
              'EOM_FETCH_NETWORK',
              'Offline mode prevents URL linting.',
              selectedTarget,
            );
          }
          const publication = await validatePublicationUrl(selectedTarget, {
            ...validationOptions,
            ...(options.graph === undefined ? {} : { fetchGraph: options.graph }),
            fetch: {
              ...(globalOptions.timeout === undefined ? {} : { timeoutMs: globalOptions.timeout }),
              ...(globalOptions.maxBytes === undefined ? {} : { maxBytes: globalOptions.maxBytes }),
              ...(globalOptions.maxRedirects === undefined
                ? {}
                : { maxRedirects: globalOptions.maxRedirects }),
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
            emit(
              { command: 'lint', file: selectedTarget, findings },
              jsonOutput(program, options.json),
            );
          }
        } else {
          const information =
            selectedTarget === '-' ? undefined : await stat(resolve(selectedTarget));
          if (information?.isDirectory()) {
            const publication = await validatePublicationDirectory(
              selectedTarget,
              validationOptions,
            );
            findings = [
              ...publication.findings,
              ...lintDocuments(publication.documents, options.strictPrivacy),
            ];
            const report = { ...publication, valid: !hasErrors(findings), findings };
            if (format || options.output) {
              await writeReport(renderValidationReport(report, format ?? 'json'), options.output);
            } else {
              emit(
                { command: 'lint', file: selectedTarget, findings },
                jsonOutput(program, options.json),
              );
            }
          } else {
            const document = await readPublication(selectedTarget);
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
              emit(
                { command: 'lint', file: selectedTarget, findings },
                jsonOutput(program, options.json),
              );
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
    .option('--output <directory>', 'validation output path; report-only and never written')
    .option('--allow-external-output', 'allow an explicitly selected output outside the project')
    .option('--json', 'emit machine-readable JSON')
    .action(
      async (
        target: string | undefined,
        options: {
          config?: string;
          output?: string;
          allowExternalOutput?: boolean;
          json?: boolean;
        },
      ) => {
        const globalOptions = program.opts<GlobalOptions>();
        const selected = options.config ?? target ?? globalOptions.config ?? 'eom.config.yaml';
        if (isAuthoringConfigPath(selected)) {
          const config = await loadAuthoringConfig(selected);
          const configuredOutput = resolve(dirname(resolve(selected)), config.output.root);
          if (options.output) {
            const configuredOutputReal = await existingRealPath(configuredOutput);
            const requestedOutputReal = await existingRealPath(resolve(options.output));
            if (
              isPathWithin(configuredOutputReal, requestedOutputReal) ||
              isPathWithin(requestedOutputReal, configuredOutputReal)
            ) {
              throw new CliUsageError(
                'The validation-only check output must be separate from the configured publication directory.',
              );
            }
          }
          const temporaryRoot = options.output
            ? undefined
            : await mkdtemp(join(tmpdir(), 'eom-check-'));
          const temporaryOutput = temporaryRoot ? join(temporaryRoot, 'public') : undefined;
          const output = options.output ?? temporaryOutput;
          try {
            const report = await buildPublication({
              configFile: selected,
              ...(output ? { outputRoot: output } : {}),
              ...(temporaryRoot ? { allowExternalOutput: true } : {}),
              ...(options.allowExternalOutput ? { allowExternalOutput: true } : {}),
              dryRun: true,
              ...(program.opts<GlobalOptions>().cacheDir
                ? { cacheDirectory: program.opts<GlobalOptions>().cacheDir }
                : {}),
              ...(globalOptions.deterministic ? { deterministic: true } : {}),
            });
            const publication =
              report.written && output
                ? await validatePublicationDirectory(output, {
                    ...(globalOptions.maxBytes === undefined
                      ? {}
                      : { maxBytes: globalOptions.maxBytes }),
                  })
                : undefined;
            const drift =
              temporaryRoot && report.written && output
                ? await compareGeneratedOutput(configuredOutput, output)
                : undefined;
            const findings = [
              ...report.findings,
              ...(publication?.findings ?? []),
              ...(drift?.finding ? [drift.finding] : []),
            ];
            const valid = report.valid && (publication?.valid ?? true) && drift?.valid !== false;
            emit(
              {
                command: 'check',
                file: selected,
                report: {
                  ...report,
                  valid,
                  findings,
                },
                ...(publication
                  ? {
                      summary: {
                        files: publication.files,
                        ...(drift
                          ? {
                              generatedOutput: configuredOutput,
                              generatedDrift: drift.status,
                              ...(drift.differences.length > 0
                                ? { differences: drift.differences }
                                : {}),
                            }
                          : {}),
                      },
                    }
                  : {}),
              },
              jsonOutput(program, options.json),
            );
            if (!valid) process.exitCode = 1;
          } finally {
            if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
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
          const publication = await validatePublicationDirectory(file, {
            ...(program.opts<GlobalOptions>().maxBytes === undefined
              ? {}
              : { maxBytes: program.opts<GlobalOptions>().maxBytes }),
          });
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
    .option('--no-graph', 'retrieve only the root manifest')
    .option('--max-resources <count>', 'maximum fetched graph resources', parseNumberOption)
    .option('--max-depth <count>', 'maximum fetched graph depth', parseNumberOption)
    .option('--max-total-bytes <bytes>', 'maximum combined graph response bytes', parseNumberOption)
    .action(
      async (
        originOrUrl: string,
        options: {
          json?: boolean;
          graph?: boolean;
          timeout?: number;
          maxBytes?: number;
          maxRedirects?: number;
          maxResources?: number;
          maxDepth?: number;
          maxTotalBytes?: number;
        },
      ) => {
        try {
          const globalOptions = program.opts<GlobalOptions>();
          if (globalOptions.offline === true) {
            throw new EomFetchError(
              'EOM_FETCH_NETWORK',
              'Offline mode prevents URL fetching.',
              originOrUrl,
            );
          }
          const publication = await validatePublicationUrl(originOrUrl, {
            fetchGraph: options.graph !== false,
            ...(options.maxResources === undefined ? {} : { maxResources: options.maxResources }),
            ...(options.maxDepth === undefined ? {} : { maxDepth: options.maxDepth }),
            ...(options.maxTotalBytes === undefined
              ? {}
              : { maxTotalBytes: options.maxTotalBytes }),
            fetch: {
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
              ...(options.maxRedirects === undefined
                ? globalOptions.maxRedirects === undefined
                  ? {}
                  : { maxRedirects: globalOptions.maxRedirects }
                : { maxRedirects: options.maxRedirects }),
              ...(globalOptions.cacheDir ? { cacheDirectory: globalOptions.cacheDir } : {}),
            },
          });
          const rootFetch = publication.fetches[0];
          const result: ValidationResult = {
            valid: publication.valid,
            structuralValid: publication.structuralValid,
            semanticValid: publication.semanticValid,
            findings: publication.findings,
          };
          emit(
            {
              command: 'fetch',
              file: originOrUrl,
              result,
              summary: {
                requestedUrl: rootFetch?.requestedUrl,
                finalUrl: rootFetch?.finalUrl,
                redirects: rootFetch?.redirects ?? [],
                files: publication.files,
                fetches: publication.fetches,
                graph: options.graph !== false,
              },
            },
            jsonOutput(program, options.json),
          );
          if (!result.valid) {
            process.exitCode = publication.findings.some((item) =>
              item.code.startsWith('EOM_FETCH_'),
            )
              ? 3
              : 1;
          }
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
    .command('audit-url')
    .argument('<origin-or-url>', 'HTTPS origin or manifest URL to audit')
    .option('--json', 'emit machine-readable JSON')
    .action(async (target: string, options: { json?: boolean }) => {
      const globalOptions = program.opts<GlobalOptions>();
      if (globalOptions.offline === true) {
        emit(
          {
            command: 'audit-url',
            file: target,
            findings: [
              {
                code: 'EOM_DOCTOR_OFFLINE',
                category: 'transport',
                severity: 'error',
                message: 'Offline mode prevents deployment auditing.',
              },
            ],
          },
          jsonOutput(program, options.json),
        );
        process.exitCode = 3;
        return;
      }
      const deployment = await auditDeployment(target, globalOptions);
      emit(
        {
          command: 'audit-url',
          file: target,
          summary: deployment as unknown as Record<string, unknown>,
        },
        jsonOutput(program, options.json),
      );
      if (!deployment.valid) {
        process.exitCode = deployment.checks.some(
          (check) => check.status === 'fail' && check.code.startsWith('EOM_FETCH_'),
        )
          ? 3
          : 1;
      }
    });

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
        cliVersion: '1.0.0-rc.3',
        node: process.version,
        schemas: availableSchemaFiles().length,
        network: 'not used',
      };
      let valid = true;
      if (target && isAuthoringConfigPath(target)) {
        const report = await buildPublication({ configFile: target, dryRun: true });
        summary.build = report;
        valid = report.valid;
      } else if (target && isOriginTarget(target)) {
        const globalOptions = program.opts<GlobalOptions>();
        if (globalOptions.offline === true) {
          summary.network = 'blocked-offline';
          summary.deployment = {
            valid: false,
            target,
            checks: [
              {
                code: 'EOM_DOCTOR_OFFLINE',
                status: 'fail',
                message: 'Offline mode prevents deployment auditing.',
              },
            ],
          };
          valid = false;
        } else {
          summary.network = 'used-explicitly';
          const deployment = await auditDeployment(target, globalOptions);
          summary.deployment = deployment;
          valid = deployment.valid;
        }
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

  program
    .command('completion')
    .argument('[shell]', 'bash, zsh, fish, or powershell', 'bash')
    .option('--json', 'emit machine-readable JSON')
    .action((shell: string, options: { json?: boolean }) => {
      const script = completionScript(shell);
      if (jsonOutput(program, options.json)) {
        emit(
          {
            command: 'completion',
            file: shell,
            summary: { shell, script },
          },
          true,
        );
      } else {
        process.stdout.write(script);
      }
    });

  return program;
}

function isUrlTarget(value: string): boolean {
  return /^https?:\/\//iu.test(value);
}

function isOriginTarget(value: string): boolean {
  if (isUrlTarget(value)) return true;
  return (
    /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?::\d+)?$/iu.test(value) &&
    !/\.(?:json|ya?ml)$/iu.test(value)
  );
}

interface DeploymentAudit {
  readonly valid: boolean;
  readonly target: string;
  readonly requestedUrl?: string;
  readonly finalUrl?: string;
  readonly status?: number;
  readonly redirects?: readonly unknown[];
  readonly fetches?: readonly PublicationFetchRecord[];
  readonly checks: readonly {
    readonly code: string;
    readonly status: 'pass' | 'warn' | 'fail';
    readonly message: string;
  }[];
}

async function auditDeployment(
  target: string,
  globalOptions: GlobalOptions,
): Promise<DeploymentAudit> {
  const checks: DeploymentAudit['checks'][number][] = [];
  const fetchOptions = deploymentFetchOptions(globalOptions);
  let response: Awaited<ReturnType<typeof fetchManifest>> | undefined;
  let graphFetches: readonly PublicationFetchRecord[] | undefined;
  try {
    response = await fetchManifest(target, fetchOptions);
    checks.push({
      code: 'EOM_DOCTOR_GET_200',
      status: 'pass',
      message: 'GET discovery returned HTTP 200 and valid JSON.',
    });
    checks.push({
      code: 'EOM_DOCTOR_HTTPS',
      status: response.finalUrl.startsWith('https://') ? 'pass' : 'fail',
      message: response.finalUrl.startsWith('https://')
        ? 'The final discovery URL uses HTTPS.'
        : 'The final discovery URL does not use HTTPS.',
    });
    checks.push({
      code: 'EOM_DOCTOR_CONTENT_TYPE',
      status: response.contentType ? 'pass' : 'fail',
      message: response.contentType
        ? `The endpoint declared ${response.contentType}.`
        : 'The endpoint did not declare a JSON content type.',
    });
    const cacheControl = response.headers['cache-control'];
    checks.push({
      code: 'EOM_DOCTOR_CACHE_CONTROL',
      status: cacheControl ? 'pass' : 'warn',
      message: cacheControl
        ? `Cache policy observed: ${cacheControl}.`
        : 'No Cache-Control policy was observed; choose an explicit bounded cache policy.',
    });
    const cors = response.headers['access-control-allow-origin'];
    checks.push({
      code: 'EOM_DOCTOR_CORS',
      status: cors ? 'pass' : 'warn',
      message: cors
        ? `CORS policy observed: ${cors}.`
        : 'No Access-Control-Allow-Origin header was observed; browser consumers may need a same-origin proxy.',
    });
    if (response.redirects.length > 0) {
      checks.push({
        code: 'EOM_DOCTOR_REDIRECTS',
        status: 'warn',
        message: `${response.redirects.length} redirect(s) occurred; verify the canonical origin and cache behavior.`,
      });
    }
    try {
      const publication = await validatePublicationUrl(target, {
        fetchGraph: true,
        fetch: fetchOptions,
      });
      checks.push({
        code: 'EOM_DOCTOR_AUTHORITY_GRAPH',
        status: publication.valid ? 'pass' : 'fail',
        message: publication.valid
          ? `The complete publication graph passed validation across ${publication.fetches.length} observed fetch(es).`
          : `The complete publication graph failed validation: ${
              publication.findings
                .filter((finding) => finding.severity === 'error')
                .slice(0, 3)
                .map((finding) => finding.code)
                .join(', ') || 'see graph findings'
            }.`,
      });
      graphFetches = publication.fetches;
    } catch (error) {
      checks.push({
        code: 'EOM_DOCTOR_AUTHORITY_GRAPH',
        status: 'fail',
        message:
          error instanceof Error
            ? `Complete publication graph validation failed: ${error.message}`
            : 'Complete publication graph validation failed.',
      });
    }
  } catch (error) {
    checks.push({
      code: error instanceof EomFetchError ? error.code : 'EOM_DOCTOR_GET_FAILED',
      status: 'fail',
      message: error instanceof Error ? error.message : 'GET discovery failed.',
    });
  }

  try {
    const head = await fetchEom(discoveryUrl(target), { ...fetchOptions, method: 'HEAD' });
    checks.push({
      code: 'EOM_DOCTOR_HEAD',
      status: head.status === 200 ? 'pass' : 'fail',
      message: `HEAD discovery returned HTTP ${head.status}.`,
    });
  } catch (error) {
    checks.push({
      code: 'EOM_DOCTOR_HEAD_FAILED',
      status: 'warn',
      message: error instanceof Error ? error.message : 'HEAD discovery failed.',
    });
  }

  return {
    valid: checks.every((check) => check.status !== 'fail'),
    target,
    ...(response
      ? {
          requestedUrl: response.requestedUrl,
          finalUrl: response.finalUrl,
          status: response.status,
          redirects: response.redirects,
        }
      : {}),
    ...(graphFetches ? { fetches: graphFetches } : {}),
    checks,
  };
}

function deploymentFetchOptions(globalOptions: GlobalOptions): FetchOptions {
  return {
    ...(globalOptions.timeout === undefined ? {} : { timeoutMs: globalOptions.timeout }),
    ...(globalOptions.maxBytes === undefined ? {} : { maxBytes: globalOptions.maxBytes }),
    ...(globalOptions.maxRedirects === undefined
      ? {}
      : { maxRedirects: globalOptions.maxRedirects }),
    ...(globalOptions.cacheDir ? { cacheDirectory: globalOptions.cacheDir } : {}),
  };
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
  throw new CliUsageError(
    `Unknown report format ${value}. Supported formats: ${supported.join(', ')}`,
  );
}

function parseBuildMode(value: string): BuildMode {
  const supported: readonly BuildMode[] = ['full', 'module', 'organization', 'changed-files'];
  if (supported.includes(value as BuildMode)) return value as BuildMode;
  throw new CliUsageError(`Unknown build mode ${value}. Supported modes: ${supported.join(', ')}`);
}

function parseConformanceMode(value: string): 'fixture' | 'publisher' | 'consumer' | 'generator' {
  const supported = ['fixture', 'publisher', 'consumer', 'generator'] as const;
  if (supported.includes(value as (typeof supported)[number])) {
    return value as (typeof supported)[number];
  }
  throw new CliUsageError(
    `Unknown conformance mode ${value}. Supported modes: ${supported.join(', ')}`,
  );
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
        fetches: publication.fetches,
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
    await writeOutputFile(output, content);
    return;
  }
  process.stdout.write(content);
}

async function writeBuildReport(
  output: string,
  content: string,
  report: BuildReport,
): Promise<void> {
  const target = resolve(output);
  const outputRoot = resolve(report.outputRoot);
  const protectedRoot = resolve(dirname(outputRoot));
  const protectedRootReal = await existingRealPath(protectedRoot);
  const home = await existingRealPath(homedir());
  const cwd = await existingRealPath(process.cwd());
  if (
    protectedRootReal === parse(protectedRootReal).root ||
    protectedRootReal === home ||
    protectedRootReal === cwd ||
    outputRoot === parse(outputRoot).root ||
    outputRoot === home ||
    outputRoot === cwd
  ) {
    throw new CliUsageError('Build reports cannot target a filesystem, home, or workspace root.');
  }
  if (isPathWithin(outputRoot, target)) {
    throw new CliUsageError(
      'Build reports must not be written inside the publication content directory.',
    );
  }
  if (!isPathWithin(protectedRoot, target)) {
    throw new CliUsageError(
      'Build reports must be written inside the protected generated bundle containing the publication output.',
    );
  }
  const protectedRealRoot = await ensureStableOutputDirectory(
    protectedRoot,
    'The generated report bundle must be a stable directory, not a symbolic link or junction.',
  );
  const targetParent = dirname(target);
  const targetParentReal = await ensureStableOutputDirectory(
    targetParent,
    'Build report paths must not traverse symlinks or junctions.',
  );
  if (!isPathWithin(protectedRealRoot, targetParentReal)) {
    throw new CliUsageError('Build report paths must not traverse symlinks or junctions.');
  }
  await writeOutputFile(join(targetParentReal, basename(target)), content);
}

async function writeOutputFile(output: string, content: string): Promise<void> {
  const target = resolve(output);
  const parent = dirname(target);
  const stableParent = await ensureStableOutputDirectory(
    parent,
    'Output paths must not traverse symbolic links or junctions.',
  );
  const stableTarget = join(stableParent, basename(target));
  try {
    const information = await lstat(stableTarget);
    if (information.isSymbolicLink() || !information.isFile()) {
      throw new CliUsageError('The output target must be a regular file, not a link or directory.');
    }
  } catch (error) {
    if (error instanceof CliUsageError || !isMissingPath(error)) throw error;
  }
  let temporaryDirectory: string | undefined;
  try {
    temporaryDirectory = await mkdtemp(join(stableParent, '.eom-output-'));
    const temporary = join(temporaryDirectory, basename(target));
    const handle = await open(temporary, 'wx');
    try {
      await handle.writeFile(content, 'utf8');
    } finally {
      await handle.close();
    }
    if (normalizeFsPath(await realpath(parent)) !== normalizeFsPath(stableParent)) {
      throw new CliUsageError('Output paths changed during atomic replacement.');
    }
    await replaceOutputTarget(temporary, stableTarget, temporaryDirectory);
  } finally {
    if (
      temporaryDirectory &&
      (await realpath(parent).then(
        (current) => normalizeFsPath(current) === normalizeFsPath(stableParent),
        () => false,
      ))
    ) {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

/**
 * Replace an existing regular output file on platforms whose rename operation
 * does not overwrite a destination. The fallback moves the verified existing
 * file into the same temporary directory, installs the new file, and restores
 * the old file if installation fails.
 */
async function replaceOutputTarget(
  temporary: string,
  target: string,
  temporaryDirectory: string,
): Promise<void> {
  try {
    await rename(temporary, target);
    return;
  } catch (error) {
    if (!isReplaceDestinationError(error)) throw error;
  }

  let existing: Awaited<ReturnType<typeof lstat>>;
  try {
    existing = await lstat(target);
  } catch (error) {
    if (isMissingPath(error)) {
      await rename(temporary, target);
      return;
    }
    throw error;
  }
  if (existing.isSymbolicLink() || !existing.isFile()) {
    throw new CliUsageError('The output target must be a regular file, not a link or directory.');
  }
  const expectedRealPath = await realpath(target);
  if (normalizeFsPath(expectedRealPath) !== normalizeFsPath(target)) {
    throw new CliUsageError('The output target must not traverse a symbolic link.');
  }
  const backup = join(temporaryDirectory, '.eom-existing-output');
  await rename(target, backup);
  try {
    await rename(temporary, target);
  } catch (error) {
    await rename(backup, target).catch(() => undefined);
    throw error;
  }
  await rm(backup, { force: true });
}

function isReplaceDestinationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'EEXIST' || error.code === 'EPERM' || error.code === 'ENOTEMPTY')
  );
}

/**
 * Create missing output directories without allowing mkdir({ recursive: true })
 * to follow a pre-existing symlink or junction. Each component is validated
 * after creation, and subsequent writes use the resolved stable path.
 */
async function ensureStableOutputDirectory(path: string, message: string): Promise<string> {
  const resolved = resolve(path);
  const missing: string[] = [];
  let current = resolved;
  let stable: string | undefined;

  for (;;) {
    try {
      const information = await lstat(current);
      if (!information.isDirectory() || information.isSymbolicLink()) {
        throw new CliUsageError(message);
      }
      stable = await realpath(current);
      if (normalizeFsPath(stable) !== normalizeFsPath(current)) {
        throw new CliUsageError(message);
      }
      break;
    } catch (error) {
      if (!isMissingPath(error)) throw error;
      const parent = dirname(current);
      if (parent === current) throw new CliUsageError(message);
      missing.push(current);
      current = parent;
    }
  }

  for (const missingPath of missing.reverse()) {
    const child = join(stable, basename(missingPath));
    try {
      await mkdir(child);
    } catch (error) {
      if (!isAlreadyExistsPath(error)) throw error;
    }
    const information = await lstat(child);
    if (!information.isDirectory() || information.isSymbolicLink()) {
      throw new CliUsageError(message);
    }
    const actual = await realpath(child);
    if (normalizeFsPath(actual) !== normalizeFsPath(child)) {
      throw new CliUsageError(message);
    }
    stable = actual;
  }
  return stable;
}

async function existingRealPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if (!isMissingPath(error)) throw error;
    const parent = dirname(path);
    if (parent === path) return resolve(path);
    return join(await existingRealPath(parent), path.slice(parent.length + 1));
  }
}

function isPathWithin(parent: string, child: string): boolean {
  const relativePath = relative(normalizeFsPath(parent), normalizeFsPath(child));
  return (
    relativePath === '' ||
    (relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath))
  );
}

interface GeneratedOutputComparison {
  readonly valid: boolean;
  readonly status: 'clean' | 'different' | 'not-present' | 'unmarked';
  readonly differences: readonly string[];
  readonly finding?: Finding;
}

async function compareGeneratedOutput(
  configuredOutput: string,
  expectedOutput: string,
): Promise<GeneratedOutputComparison> {
  let information;
  try {
    information = await lstat(configuredOutput);
  } catch (error) {
    if (isMissingPath(error)) {
      return { valid: true, status: 'not-present', differences: [] };
    }
    throw error;
  }
  if (!information.isDirectory() || information.isSymbolicLink()) {
    return {
      valid: false,
      status: 'unmarked',
      differences: [configuredOutput],
      finding: {
        code: 'EOM_GENERATED_DRIFT',
        category: 'quality',
        severity: 'error',
        message: 'The configured generated output path is not a directory.',
        resource: configuredOutput,
      },
    };
  }
  try {
    if (normalizeFsPath(await realpath(configuredOutput)) !== normalizeFsPath(configuredOutput)) {
      return {
        valid: false,
        status: 'unmarked',
        differences: [configuredOutput],
        finding: {
          code: 'EOM_GENERATED_DRIFT',
          category: 'quality',
          severity: 'error',
          message: 'The configured generated output must not traverse symbolic links or junctions.',
          resource: configuredOutput,
        },
      };
    }
  } catch {
    return {
      valid: false,
      status: 'unmarked',
      differences: [configuredOutput],
      finding: {
        code: 'EOM_GENERATED_DRIFT',
        category: 'quality',
        severity: 'error',
        message: 'The configured generated output could not be resolved safely.',
        resource: configuredOutput,
      },
    };
  }
  let marker: unknown;
  try {
    marker = parseStrictJson(
      decodeUtf8(
        await readBoundedFile(join(configuredOutput, '.eom-generated.json')),
        join(configuredOutput, '.eom-generated.json'),
      ),
      join(configuredOutput, '.eom-generated.json'),
    );
  } catch {
    return {
      valid: false,
      status: 'unmarked',
      differences: ['.eom-generated.json'],
      finding: {
        code: 'EOM_GENERATED_DRIFT',
        category: 'quality',
        severity: 'error',
        message: 'The configured generated output is not marked as EOM generator-owned.',
        resource: configuredOutput,
      },
    };
  }
  if (
    !isJsonObject(marker) ||
    marker.generator !== 'eom' ||
    marker.specification !== 'https://paperandslate.org/spec/eom/1.0' ||
    typeof marker.toolVersion !== 'string'
  ) {
    return {
      valid: false,
      status: 'unmarked',
      differences: ['.eom-generated.json'],
      finding: {
        code: 'EOM_GENERATED_DRIFT',
        category: 'quality',
        severity: 'error',
        message: 'The configured generated output marker is not valid.',
        resource: configuredOutput,
      },
    };
  }
  const [actual, expected] = await Promise.all([
    comparableFiles(configuredOutput),
    comparableFiles(expectedOutput),
  ]);
  const names = [...new Set([...actual.keys(), ...expected.keys()])].sort();
  const differences = names.filter((name) => {
    const left = actual.get(name);
    const right = expected.get(name);
    return left === undefined || right === undefined || !left.equals(right);
  });
  if (differences.length === 0) return { valid: true, status: 'clean', differences };
  return {
    valid: false,
    status: 'different',
    differences,
    finding: {
      code: 'EOM_GENERATED_DRIFT',
      category: 'quality',
      severity: 'error',
      message: `Generated output differs in ${differences.length} file(s).`,
      resource: configuredOutput,
      related: differences,
    },
  };
}

async function comparableFiles(directory: string): Promise<Map<string, Buffer>> {
  const result = new Map<string, Buffer>();
  async function visit(current: string): Promise<void> {
    await assertStableDirectoryPath(
      current,
      'Generated output comparison paths must not traverse symbolic links or junctions.',
    );
    const entries = (await readdir(current, { withFileTypes: true })).sort((left, right) =>
      compareStrings(left.name, right.name),
    );
    for (const entry of entries) {
      const path = join(current, entry.name);
      const relativePath = path.slice(directory.length + 1).replaceAll('\\', '/');
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        result.set(relativePath, await readBoundedFile(path));
      }
    }
  }
  await visit(directory);
  return result;
}

function isMissingPath(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isAlreadyExistsPath(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}

function isAuthoringConfigPath(value: string): boolean {
  const lower = value.toLowerCase();
  return lower.endsWith('.yaml') || lower.endsWith('.yml');
}

async function validateAuthoringProject(
  configFile: string,
  deterministic: boolean,
): Promise<ValidationResult> {
  try {
    await loadAuthoringConfig(configFile);
    const report = await buildPublication({
      configFile,
      dryRun: true,
      ...(deterministic ? { deterministic: true } : {}),
    });
    const errors = report.findings.filter((item) => item.severity === 'error');
    return {
      valid: report.valid,
      structuralValid: !errors.some(
        (item) => item.category === 'syntax' || item.category === 'structural',
      ),
      semanticValid: !errors.some(
        (item) =>
          item.category !== 'syntax' &&
          item.category !== 'structural' &&
          item.category !== 'quality',
      ),
      schema: 'config.schema.json and generated publication schemas',
      findings: report.findings,
    };
  } catch (error) {
    const findings =
      error instanceof GeneratorInputError && error.findings.length > 0
        ? error.findings
        : [
            {
              code: 'EOM_GENERATOR_INPUT_INVALID',
              category: 'syntax' as const,
              severity: 'error' as const,
              message:
                error instanceof Error ? error.message : 'Authoring project validation failed.',
              resource: configFile,
            },
          ];
    return {
      valid: false,
      structuralValid: false,
      semanticValid: false,
      schema: 'config.schema.json',
      findings,
    };
  }
}

function completionScript(shell: string): string {
  const commands = [
    'audit-url',
    'build',
    'candidate',
    'check',
    'completion',
    'conformance',
    'diff',
    'doctor',
    'explain',
    'fetch',
    'init',
    'inspect',
    'lint',
    'map',
    'migrate',
    'schema',
    'sign',
    'validate',
    'verify',
  ] as const;
  const values = commands.join(' ');
  switch (shell.toLowerCase()) {
    case 'bash':
      return `# eom bash completion\n_eom_complete() {\n  local current="${'${COMP_WORDS[COMP_CWORD]}'}"\n  COMPREPLY=( $(compgen -W "${values}" -- "$current") )\n}\ncomplete -F _eom_complete eom\n`;
    case 'zsh':
      return `# eom zsh completion\n#compdef eom\n_arguments '1:command:(${commands.join('|')})'\n`;
    case 'fish':
      return `# eom fish completion\ncomplete -c eom -f -n '__fish_use_subcommand' -a '${commands.join(' ')}'\n`;
    case 'powershell':
    case 'pwsh':
      return `$eomCommands = '${commands.join(' ')}'.Split(' ')\nRegister-ArgumentCompleter -Native -CommandName eom -ScriptBlock {\n  param($wordToComplete, $commandAst, $cursorPosition)\n  $eomCommands | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {\n    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)\n  }\n}\n`;
    default:
      throw new CliUsageError(
        `Unsupported completion shell ${shell}. Supported shells: bash, zsh, fish, powershell.`,
      );
  }
}

function parseAdapterFormat(value: string): AdapterFormat {
  if ((supportedAdapterFormats() as readonly string[]).includes(value)) {
    return value as AdapterFormat;
  }
  throw new CliUsageError(
    `Unknown adapter format ${value}. Supported formats: ${supportedAdapterFormats().join(', ')}`,
  );
}

const INIT_MODULE_KEYS = [
  'organization',
  'contacts',
  'campuses',
  'departments',
  'staff',
  'courses',
  'offerings',
  'programs',
  'calendar',
  'events',
  'facilities',
  'services',
  'policies',
  'admissions',
  'sports',
  'transportation',
  'meals',
  'clubs',
  'jobs',
  'news',
  'statistics',
  'apis',
] as const;

const INIT_MODULE_ALIASES: Readonly<Record<string, (typeof INIT_MODULE_KEYS)[number]>> = {
  organization: 'organization',
  organizations: 'organization',
  profile: 'organization',
  contact: 'contacts',
  contactdirectory: 'contacts',
  campus: 'campuses',
  department: 'departments',
  staffdirectory: 'staff',
  course: 'courses',
  'course-catalog': 'courses',
  offering: 'offerings',
  sections: 'offerings',
  'course-offering-catalog': 'offerings',
  program: 'programs',
  pathways: 'programs',
  calendar: 'calendar',
  calendars: 'calendar',
  academiccalendar: 'calendar',
  'academic-calendar': 'calendar',
  event: 'events',
  facility: 'facilities',
  service: 'services',
  policy: 'policies',
  documents: 'policies',
  admission: 'admissions',
  sport: 'sports',
  athletics: 'sports',
  transport: 'transportation',
  routes: 'transportation',
  meal: 'meals',
  menus: 'meals',
  menues: 'meals',
  club: 'clubs',
  activities: 'clubs',
  job: 'jobs',
  opportunities: 'jobs',
  article: 'news',
  announcements: 'news',
  statistic: 'statistics',
  stats: 'statistics',
  api: 'apis',
  apiservices: 'apis',
  servicesdiscovery: 'apis',
};

function initModuleKey(value: string): (typeof INIT_MODULE_KEYS)[number] | undefined {
  const normalized = value.toLowerCase().replaceAll('_', '-').replaceAll(' ', '-');
  if ((INIT_MODULE_KEYS as readonly string[]).includes(normalized)) {
    return normalized as (typeof INIT_MODULE_KEYS)[number];
  }
  return INIT_MODULE_ALIASES[normalized.replaceAll('-', '')] ?? INIT_MODULE_ALIASES[normalized];
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
    throw new CliUsageError(
      `Unknown init template ${options.template}. Choose minimal-school, district, or rich-school.`,
    );
  }
  if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(options.language)) {
    throw new CliUsageError(`Invalid BCP 47 language ${options.language}.`);
  }
  const origin = validateInitOrigin(options.origin);
  const target = resolve(directory);
  let targetExists = false;
  try {
    const targetInformation = await lstat(target);
    targetExists = true;
    if (!targetInformation.isDirectory() || targetInformation.isSymbolicLink()) {
      throw new Error('The init target must be a regular directory, not a link or file.');
    }
    await assertStableDirectoryPath(
      target,
      'The init target must not traverse symbolic links or junctions.',
    );
  } catch (error) {
    if (!isMissingPath(error)) throw error;
  }
  let existing: readonly string[] = [];
  try {
    existing = (await readdir(target)).sort();
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  const requestedModules = (options.modules ?? 'organization,contacts')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const normalizedRequestedModules = requestedModules.map((value) => {
    const key = initModuleKey(value);
    if (!key) {
      throw new CliUsageError(
        `Unknown init module ${value}. Supported modules: ${INIT_MODULE_KEYS.join(', ')}.`,
      );
    }
    return key;
  });
  const selectedModules = ['organization', 'contacts', ...normalizedRequestedModules].filter(
    (value, index, values) => values.indexOf(value) === index,
  );
  const starterFiles = [
    'eom.config.yaml',
    'source/organization.yaml',
    'source/contacts.yaml',
    'source/README.md',
    ...selectedModules
      .filter((module) => !['organization', 'contacts'].includes(module))
      .map((module) => `source/modules/${module}.yaml`),
  ];
  if (existing.length > 0 && options.force !== true) {
    throw new Error(
      `Refusing to initialize non-empty directory ${target}; use --force only for starter files.`,
    );
  }
  if (!targetExists) {
    await ensureStableOutputDirectory(
      target,
      'The init target must not traverse symbolic links or junctions.',
    );
  }
  await assertStableDirectoryPath(
    target,
    'The init target must not traverse symbolic links or junctions.',
  );
  const sourceDirectory = join(target, 'source');
  try {
    await assertStableDirectoryPath(
      sourceDirectory,
      'The init source directory must not traverse symbolic links or junctions.',
    );
  } catch (error) {
    if (!isMissingPath(error)) throw error;
    await mkdir(sourceDirectory);
    await assertStableDirectoryPath(
      sourceDirectory,
      'The init source directory must not traverse symbolic links or junctions.',
    );
  }
  const modulesDirectory = join(sourceDirectory, 'modules');
  await ensureStableOutputDirectory(
    modulesDirectory,
    'The init source directory must not traverse symbolic links or junctions.',
  );
  const name = templateName(options.template, basename(target));
  const organizationType = options.template === 'district' ? 'district' : 'secondary-school';
  const organizationIdSegment = options.template === 'district' ? 'district' : 'school';
  const moduleConfig = selectedModules.flatMap((module) => [
    `    ${module}:`,
    `      - ${module === 'organization' ? 'organization.yaml' : module === 'contacts' ? 'contacts.yaml' : `modules/${module}.yaml`}`,
  ]);
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
    ...moduleConfig,
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
    `id: ${origin}/id/${organizationIdSegment}`,
    `type: ${organizationType}`,
    `organizationType: ${organizationType}`,
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
    `Generated module source stubs: ${selectedModules.filter((module) => !['organization', 'contacts'].includes(module)).length}. Replace empty item lists with reviewed public data before building.`,
    'All example identifiers use the configured origin; replace them only with identifiers you control.',
    '',
  ].join('\n');
  const files: Record<string, string> = {
    'eom.config.yaml': config,
    'source/organization.yaml': organization,
    'source/contacts.yaml': contacts,
    'source/README.md': readme,
  };
  for (const module of selectedModules) {
    if (['organization', 'contacts'].includes(module)) continue;
    files[`source/modules/${module}.yaml`] = 'items: []\n';
  }
  const written: string[] = [];
  const skipped: string[] = [];
  for (const file of starterFiles) {
    const path = join(target, file);
    const result = await writeNewInitFile(path, files[file] ?? '');
    if (result === 'skipped') {
      skipped.push(file);
    } else {
      written.push(file);
    }
  }
  return {
    directory: target,
    template: options.template,
    origin,
    language: options.language,
    requestedModules,
    selectedModules,
    written,
    skipped,
  };
}

function validateInitOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new CliUsageError('The init origin must be a valid HTTPS URL.');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new CliUsageError(
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

async function assertStableDirectoryPath(path: string, message: string): Promise<string> {
  const resolved = resolve(path);
  const information = await lstat(resolved);
  if (!information.isDirectory() || information.isSymbolicLink()) throw new Error(message);
  const actual = await realpath(resolved);
  if (normalizeFsPath(actual) !== normalizeFsPath(resolved)) throw new Error(message);
  return actual;
}

async function writeNewInitFile(path: string, content: string): Promise<'written' | 'skipped'> {
  const parent = dirname(resolve(path));
  const stableParent = await assertStableDirectoryPath(
    parent,
    'The init file parent must not traverse symbolic links or junctions.',
  );
  const stableTarget = join(stableParent, basename(path));
  try {
    const information = await lstat(stableTarget);
    if (information.isSymbolicLink() || !information.isFile()) {
      throw new Error('The init starter path must be a regular file, not a link or directory.');
    }
    return 'skipped';
  } catch (error) {
    if (!isMissingPath(error)) throw error;
  }
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(stableTarget, 'wx');
    await handle.writeFile(content, 'utf8');
    const information = await handle.stat();
    if (!information.isFile()) throw new Error('The initialized file is not a regular file.');
    if (normalizeFsPath(await realpath(parent)) !== normalizeFsPath(stableParent)) {
      throw new Error('The init file parent changed during creation.');
    }
    const current = await lstat(stableTarget);
    if (!current.isFile() || current.isSymbolicLink()) {
      throw new Error('The initialized file changed during creation.');
    }
    return 'written';
  } catch (error) {
    if (isAlreadyExistsPath(error)) {
      const information = await lstat(stableTarget);
      if (information.isSymbolicLink() || !information.isFile()) {
        throw new Error('The init starter path must be a regular file, not a link or directory.');
      }
      return 'skipped';
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

async function readAdapterInput(file: string, format: AdapterFormat): Promise<unknown> {
  const text = await readTextInput(file);
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
  throw new CliInputError('No EOM well-known manifest was found in the target directory.');
}

function parseNumberOption(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new CliUsageError(`Invalid numeric option: ${value}`);
  }
  return parsed;
}

function collectOption(value: string, previous: readonly string[] = []): string[] {
  const normalized = value.trim();
  if (!normalized) throw new CliUsageError('Repeatable path options must not be empty.');
  return [...previous, normalized];
}

function applyUserOptions(program: Command): void {
  const explicit = process.env.EOM_USER_CONFIG?.trim();
  const candidates = [
    ...(explicit ? [resolve(explicit)] : []),
    ...(process.env.APPDATA ? [join(process.env.APPDATA, 'eom', 'config.json')] : []),
    ...(process.env.XDG_CONFIG_HOME
      ? [join(process.env.XDG_CONFIG_HOME, 'eom', 'config.json')]
      : []),
    join(homedir(), '.config', 'eom', 'config.json'),
  ].filter((path, index, paths) => paths.indexOf(path) === index);
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) {
    if (explicit) throw new CliInputError(`User CLI configuration was not found: ${explicit}`);
    return;
  }
  const bytes = readBoundedFileSync(path, MAX_CLI_INPUT_BYTES, 'User CLI configuration');
  const parsed = parseStrictJson(decodeUtf8(bytes, path), path);
  if (!isJsonObject(parsed))
    throw new CliInputError('User CLI configuration must be a JSON object.');
  const allowed = new Set([
    'json',
    'quiet',
    'verbose',
    'color',
    'config',
    'deterministic',
    'offline',
    'timeout',
    'maxBytes',
    'maxRedirects',
    'cacheDir',
  ]);
  const unknown = Object.keys(parsed).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new CliInputError(
      `User CLI configuration has unsupported option(s): ${unknown.join(', ')}`,
    );
  }
  for (const option of ['json', 'quiet', 'verbose', 'color', 'deterministic', 'offline'] as const) {
    const value = parsed[option];
    if (value !== undefined) {
      if (typeof value !== 'boolean')
        throw new CliInputError(`User option ${option} must be boolean.`);
      program.setOptionValue(option, value);
    }
  }
  for (const option of ['timeout', 'maxBytes', 'maxRedirects'] as const) {
    const value = parsed[option];
    if (value !== undefined) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new CliInputError(`User option ${option} must be a non-negative finite number.`);
      }
      program.setOptionValue(option, value);
    }
  }
  for (const option of ['config', 'cacheDir'] as const) {
    const value = parsed[option];
    if (value !== undefined) {
      if (typeof value !== 'string' || value.trim() === '') {
        throw new CliInputError(`User option ${option} must be a non-empty string.`);
      }
      program.setOptionValue(option, value);
    }
  }
}

function applyEnvironmentOptions(program: Command): void {
  const booleanOptions = [
    ['json', 'EOM_JSON'],
    ['quiet', 'EOM_QUIET'],
    ['verbose', 'EOM_VERBOSE'],
    ['offline', 'EOM_OFFLINE'],
    ['deterministic', 'EOM_DETERMINISTIC'],
  ] as const;
  for (const [option, variable] of booleanOptions) {
    const value = process.env[variable];
    if (value === undefined || value.trim() === '') continue;
    program.setOptionValue(option, parseEnvironmentBoolean(variable, value));
  }
  const noColor = process.env.EOM_NO_COLOR ?? process.env.NO_COLOR;
  if (noColor !== undefined && noColor.trim() !== '') {
    program.setOptionValue('color', false);
  }
  const numericOptions = [
    ['timeout', 'EOM_TIMEOUT'],
    ['maxBytes', 'EOM_MAX_BYTES'],
    ['maxRedirects', 'EOM_MAX_REDIRECTS'],
  ] as const;
  for (const [option, variable] of numericOptions) {
    const value = process.env[variable];
    if (value === undefined || value.trim() === '') continue;
    try {
      program.setOptionValue(option, parseNumberOption(value));
    } catch {
      throw new CliInputError(`${variable} must be a non-negative finite number.`);
    }
  }
  if (process.env.EOM_CACHE_DIR?.trim()) {
    program.setOptionValue('cacheDir', process.env.EOM_CACHE_DIR);
  }
  if (process.env.EOM_CONFIG?.trim()) {
    program.setOptionValue('config', process.env.EOM_CONFIG);
  }
}

function parseEnvironmentBoolean(variable: string, value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new CliInputError(`${variable} must be true/false, 1/0, yes/no, or on/off.`);
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
    EOM_SEMANTIC_WORK_LIMIT: {
      category: 'security',
      summary: 'Semantic validation stopped after reaching a bounded course-code work budget.',
      remediation:
        'Split the catalog or reduce repeated course-code comparisons, then validate the smaller publication.',
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
  const bytes = file === '-' ? await readStdin() : await readBoundedFile(file);
  const text = decodeUtf8(bytes, file);
  return parseStrictJson(text, file);
}

async function readJsonArray(file: string): Promise<readonly unknown[]> {
  const value = await readPublication(file);
  if (!Array.isArray(value)) throw new Error(`${file} must contain a JSON array.`);
  return value.map((item: unknown) => item);
}

async function readStdin(): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += bytes.byteLength;
    if (total > MAX_CLI_INPUT_BYTES) {
      throw new CliInputError(
        `Standard input exceeds the ${MAX_CLI_INPUT_BYTES}-byte CLI input limit.`,
      );
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

async function readBoundedFile(file: string): Promise<Buffer> {
  const path = resolve(file);
  const linkInformation = await lstat(path);
  if (!linkInformation.isFile() || linkInformation.isSymbolicLink()) {
    throw new CliInputError(`${file} must be a stable regular file.`);
  }
  const expectedRealPath = await realpath(path);
  if (normalizeFsPath(expectedRealPath) !== normalizeFsPath(path)) {
    throw new CliInputError(`${file} must not traverse a symbolic link.`);
  }
  const handle = await open(path, 'r');
  try {
    const information = await handle.stat();
    const identityChanged =
      linkInformation.dev !== 0 &&
      linkInformation.ino !== 0 &&
      information.dev !== 0 &&
      information.ino !== 0 &&
      (information.dev !== linkInformation.dev || information.ino !== linkInformation.ino);
    if (!information.isFile() || identityChanged)
      throw new CliInputError(`${file} must be a stable regular file.`);
    if (information.size > MAX_CLI_INPUT_BYTES) {
      throw new CliInputError(`${file} exceeds the ${MAX_CLI_INPUT_BYTES}-byte CLI input limit.`);
    }
    const currentRealPath = await realpath(path);
    if (
      normalizeFsPath(currentRealPath) !== normalizeFsPath(expectedRealPath) ||
      normalizeFsPath(currentRealPath) !== normalizeFsPath(path)
    ) {
      throw new CliInputError(`${file} changed its filesystem identity.`);
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, MAX_CLI_INPUT_BYTES - total + 1));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      chunks.push(chunk.subarray(0, bytesRead));
      if (total > MAX_CLI_INPUT_BYTES) {
        throw new CliInputError(`${file} exceeds the ${MAX_CLI_INPUT_BYTES}-byte CLI input limit.`);
      }
    }
    return Buffer.concat(chunks, total);
  } finally {
    await handle.close();
  }
}

function readBoundedFileSync(path: string, limit: number, label: string): Buffer {
  const linkInformation = lstatSync(path);
  if (!linkInformation.isFile() || linkInformation.isSymbolicLink()) {
    throw new CliInputError(`${label} must be a stable regular file.`);
  }
  const expectedRealPath = realpathSync(path);
  if (normalizeFsPath(expectedRealPath) !== normalizeFsPath(path)) {
    throw new CliInputError(`${label} must not traverse a symbolic link.`);
  }
  const descriptor = openSync(path, 'r');
  try {
    const information = fstatSync(descriptor);
    const identityChanged =
      linkInformation.dev !== 0 &&
      linkInformation.ino !== 0 &&
      information.dev !== 0 &&
      information.ino !== 0 &&
      (information.dev !== linkInformation.dev || information.ino !== linkInformation.ino);
    if (!information.isFile() || identityChanged)
      throw new CliInputError(`${label} must be a stable regular file.`);
    if (information.size > limit) {
      throw new CliInputError(`${label} exceeds the ${limit}-byte CLI input limit.`);
    }
    const currentRealPath = realpathSync(path);
    if (
      normalizeFsPath(currentRealPath) !== normalizeFsPath(expectedRealPath) ||
      normalizeFsPath(currentRealPath) !== normalizeFsPath(path)
    ) {
      throw new CliInputError(`${label} changed its filesystem identity.`);
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, limit - total + 1));
      const bytesRead = readSync(descriptor, chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      chunks.push(chunk.subarray(0, bytesRead));
      if (total > limit)
        throw new CliInputError(`${label} exceeds the ${limit}-byte CLI input limit.`);
    }
    return Buffer.concat(chunks, total);
  } finally {
    closeSync(descriptor);
  }
}

async function readTextInput(file: string): Promise<string> {
  return decodeUtf8(await readBoundedFile(file), file);
}

class CliInputError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CliInputError';
  }
}

class CliUsageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function decodeUtf8(bytes: Uint8Array, resource: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(
      `${resource} is not valid UTF-8: ${error instanceof Error ? error.message : 'invalid byte sequence.'}`,
    );
  }
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
  if (!json && activeProgram?.opts<GlobalOptions>().quiet === true) return;
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
  try {
    await createCli().parseAsync(process.argv);
  } catch (error) {
    if (
      error instanceof CommanderError &&
      (error.code === 'commander.helpDisplayed' || error.code === 'commander.version')
    ) {
      process.exitCode = 0;
    } else {
      process.stderr.write(`eom: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = cliExitCode(error);
    }
  }
}

function cliExitCode(error: unknown): number {
  if (error instanceof CommanderError) return 2;
  if (error instanceof CliUsageError) return 2;
  if (error instanceof EomFetchError) return 3;
  if (
    error instanceof StrictJsonError ||
    error instanceof GeneratorInputError ||
    error instanceof CliInputError
  )
    return 1;
  if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return 2;
  return 4;
}
