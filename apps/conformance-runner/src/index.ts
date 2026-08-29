import { lstat, mkdir, mkdtemp, open, realpath, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join, resolve } from 'node:path';
import { stringifyCanonical } from '@paperandslate/eom-core';
import {
  isConformanceProfileName,
  runConformance,
  type ConformanceProfileName,
} from '@paperandslate/eom-testkit';

const VERSION = '1.0.0-rc.3';

export async function runConformanceCli(
  args: readonly string[] = process.argv.slice(2),
): Promise<number> {
  try {
    const parsed = parseArguments(args);
    if (parsed.help) {
      process.stdout.write(usage());
      return 0;
    }
    if (parsed.version) {
      process.stdout.write(`${VERSION}\n`);
      return 0;
    }
    if (!parsed.directory) throw new CliUsageError('A publication directory is required.');
    if (parsed.offline && parsed.origin) {
      throw new CliUsageError('--offline cannot be combined with --origin.');
    }
    validateFixtureFetchOptions(parsed);
    const report = await runConformance({
      directory: parsed.directory,
      ...(parsed.profile ? { profile: parsed.profile } : {}),
      ...(parsed.origin ? { origin: parsed.origin, mode: parsed.mode ?? 'publisher' } : {}),
      ...(parsed.mode ? { mode: parsed.mode } : {}),
      ...(parsed.fixtureAuthorityOrigin
        ? { fixtureAuthorityOrigin: parsed.fixtureAuthorityOrigin }
        : {}),
      ...(parsed.implementation ? { implementationName: parsed.implementation } : {}),
      ...(parsed.implementationVersion
        ? { implementationVersion: parsed.implementationVersion }
        : {}),
      ...(parsed.implementationSource ? { implementationSource: parsed.implementationSource } : {}),
      ...(parsed.now ? { now: parsed.now } : {}),
      ...(parsed.maxFiles === undefined ? {} : { maxFiles: parsed.maxFiles }),
      ...(parsed.maxTotalBytes === undefined ? {} : { maxTotalBytes: parsed.maxTotalBytes }),
      ...(parsed.maxDepth === undefined ? {} : { maxDepth: parsed.maxDepth }),
      fetch: {
        ...(parsed.timeoutMs === undefined ? {} : { timeoutMs: parsed.timeoutMs }),
        ...(parsed.maxBytes === undefined ? {} : { maxBytes: parsed.maxBytes }),
        ...(parsed.maxRedirects === undefined ? {} : { maxRedirects: parsed.maxRedirects }),
        ...(parsed.cacheDirectory ? { cacheDirectory: parsed.cacheDirectory } : {}),
        ...(parsed.allowHttp ? { allowHttp: true } : {}),
        ...(parsed.allowPrivateHosts ? { allowPrivateHosts: true } : {}),
        ...(parsed.allowNonStandardPorts ? { allowNonStandardPorts: true } : {}),
      },
    });
    const output = stringifyCanonical(report as never);
    if (parsed.output) await writeOutputFile(parsed.output, output);
    if (!parsed.quiet) process.stdout.write(output);
    return report.status === 'conforming' ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n${usage()}`);
    return error instanceof CliUsageError ? 2 : 1;
  }
}

interface ParsedArguments {
  readonly directory?: string;
  readonly profile?: ConformanceProfileName;
  readonly mode?: 'fixture' | 'publisher' | 'consumer' | 'generator';
  readonly origin?: string;
  readonly fixtureAuthorityOrigin?: string;
  readonly implementation?: string;
  readonly implementationVersion?: string;
  readonly implementationSource?: string;
  readonly output?: string;
  readonly now?: Date;
  readonly maxFiles?: number;
  readonly maxTotalBytes?: number;
  readonly maxDepth?: number;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  readonly maxRedirects?: number;
  readonly cacheDirectory?: string;
  readonly allowHttp: boolean;
  readonly allowPrivateHosts: boolean;
  readonly allowNonStandardPorts: boolean;
  readonly offline: boolean;
  readonly quiet: boolean;
  readonly help: boolean;
  readonly version: boolean;
}

class CliUsageError extends Error {}

function validateFixtureFetchOptions(parsed: ParsedArguments): void {
  const requestsFixtureOverride =
    parsed.allowHttp || parsed.allowPrivateHosts || parsed.allowNonStandardPorts;
  if (!requestsFixtureOverride) return;
  if (
    !parsed.origin ||
    (parsed.mode !== undefined && parsed.mode !== 'publisher') ||
    !isLoopbackFixtureOrigin(parsed.origin) ||
    !parsed.fixtureAuthorityOrigin ||
    !isHttpsAuthorityOrigin(parsed.fixtureAuthorityOrigin)
  ) {
    throw new CliUsageError(
      'Network safety overrides are limited to an explicit publisher check against a loopback HTTP origin with an HTTPS --fixture-authority-origin.',
    );
  }
}

export function isLoopbackFixtureOrigin(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'http:' &&
      !parsed.username &&
      !parsed.password &&
      (parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]')
    );
  } catch {
    return false;
  }
}

function isHttpsAuthorityOrigin(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      parsed.pathname === '/' &&
      parsed.search === '' &&
      parsed.hash === ''
    );
  } catch {
    return false;
  }
}

async function writeOutputFile(output: string, content: string): Promise<void> {
  const target = resolve(output);
  const parent = dirname(target);
  const stableParent = await ensureStableOutputDirectory(parent);
  const stableTarget = join(stableParent, basename(target));
  try {
    const information = await lstat(stableTarget);
    if (information.isSymbolicLink() || !information.isFile()) {
      throw new CliUsageError('The output target must be a regular file, not a link or directory.');
    }
  } catch (error) {
    if (error instanceof CliUsageError || !isMissingPath(error)) {
      throw error;
    }
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

/** Replace an existing regular report file on platforms with non-overwriting rename. */
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

async function ensureStableOutputDirectory(path: string): Promise<string> {
  const resolved = resolve(path);
  const missing: string[] = [];
  let current = resolved;
  let stable: string | undefined;

  for (;;) {
    try {
      const information = await lstat(current);
      if (!information.isDirectory() || information.isSymbolicLink()) {
        throw new CliUsageError('Output paths must not traverse symbolic links or junctions.');
      }
      stable = await realpath(current);
      if (normalizeFsPath(stable) !== normalizeFsPath(current)) {
        throw new CliUsageError('Output paths must not traverse symbolic links or junctions.');
      }
      break;
    } catch (error) {
      if (!isMissingPath(error)) throw error;
      const parent = dirname(current);
      if (parent === current) {
        throw new CliUsageError('Output paths must not traverse symbolic links or junctions.');
      }
      missing.push(current);
      current = parent;
    }
  }

  for (const missingPath of missing.reverse()) {
    const child = join(stable, basename(missingPath));
    try {
      await mkdir(child);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
    }
    const information = await lstat(child);
    if (!information.isDirectory() || information.isSymbolicLink()) {
      throw new CliUsageError('Output paths must not traverse symbolic links or junctions.');
    }
    const actual = await realpath(child);
    if (normalizeFsPath(actual) !== normalizeFsPath(child)) {
      throw new CliUsageError('Output paths must not traverse symbolic links or junctions.');
    }
    stable = actual;
  }
  return stable;
}

function normalizeFsPath(value: string): string {
  const resolved = resolve(value);
  return process.platform === 'win32' ? resolved.replaceAll('/', '\\').toLowerCase() : resolved;
}

function isMissingPath(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function parseArguments(args: readonly string[]): ParsedArguments {
  const values: {
    directory?: string;
    profile?: ConformanceProfileName;
    mode?: ParsedArguments['mode'];
    origin?: string;
    fixtureAuthorityOrigin?: string;
    implementation?: string;
    implementationVersion?: string;
    implementationSource?: string;
    output?: string;
    now?: Date;
    maxFiles?: number;
    maxTotalBytes?: number;
    maxDepth?: number;
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
    cacheDirectory?: string;
    allowHttp?: boolean;
    allowPrivateHosts?: boolean;
    allowNonStandardPorts?: boolean;
    offline?: boolean;
    quiet?: boolean;
    help?: boolean;
    version?: boolean;
  } = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument) continue;
    if (argument === '--help' || argument === '-h') {
      values.help = true;
      continue;
    }
    if (argument === '--version' || argument === '-V') {
      values.version = true;
      continue;
    }
    if (argument === '--json' || argument === '--no-color' || argument === '--verbose') continue;
    if (argument === '--quiet') {
      values.quiet = true;
      continue;
    }
    if (argument === '--offline') {
      values.offline = true;
      continue;
    }
    if (argument === '--allow-http') {
      values.allowHttp = true;
      continue;
    }
    if (argument === '--allow-private-hosts') {
      values.allowPrivateHosts = true;
      continue;
    }
    if (argument === '--allow-non-standard-ports') {
      values.allowNonStandardPorts = true;
      continue;
    }
    if (!argument.startsWith('-')) {
      if (values.directory) throw new CliUsageError('Only one publication directory is allowed.');
      values.directory = argument;
      continue;
    }
    const [name, inlineValue] = splitOption(argument);
    const value = inlineValue ?? nextValue(args, ++index, name);
    switch (name) {
      case '--profile':
        if (!isConformanceProfileName(value))
          throw new CliUsageError(`Unknown conformance profile ${value}.`);
        values.profile = value;
        break;
      case '--mode':
        if (!['fixture', 'publisher', 'consumer', 'generator'].includes(value))
          throw new CliUsageError(`Unknown conformance mode ${value}.`);
        values.mode = value as ParsedArguments['mode'];
        break;
      case '--origin':
        values.origin = value;
        break;
      case '--fixture-authority-origin':
        values.fixtureAuthorityOrigin = value;
        break;
      case '--implementation':
        values.implementation = value;
        break;
      case '--implementation-version':
        values.implementationVersion = value;
        break;
      case '--implementation-source':
        values.implementationSource = value;
        break;
      case '--output':
        values.output = value;
        break;
      case '--now':
        values.now = parseDate(value, name);
        break;
      case '--max-files':
        values.maxFiles = parsePositive(value, name);
        break;
      case '--max-total-bytes':
        values.maxTotalBytes = parsePositive(value, name);
        break;
      case '--max-depth':
        values.maxDepth = parseNonNegative(value, name);
        break;
      case '--timeout':
        values.timeoutMs = parsePositive(value, name);
        break;
      case '--max-bytes':
        values.maxBytes = parsePositive(value, name);
        break;
      case '--max-redirects':
        values.maxRedirects = parseNonNegative(value, name);
        break;
      case '--cache-dir':
        values.cacheDirectory = value;
        break;
      default:
        throw new CliUsageError(`Unknown option ${argument}.`);
    }
  }
  return {
    ...(values.directory === undefined ? {} : { directory: values.directory }),
    ...(values.profile === undefined ? {} : { profile: values.profile }),
    ...(values.mode === undefined ? {} : { mode: values.mode }),
    ...(values.origin === undefined ? {} : { origin: values.origin }),
    ...(values.fixtureAuthorityOrigin === undefined
      ? {}
      : { fixtureAuthorityOrigin: values.fixtureAuthorityOrigin }),
    ...(values.implementation === undefined ? {} : { implementation: values.implementation }),
    ...(values.implementationVersion === undefined
      ? {}
      : { implementationVersion: values.implementationVersion }),
    ...(values.implementationSource === undefined
      ? {}
      : { implementationSource: values.implementationSource }),
    ...(values.output === undefined ? {} : { output: values.output }),
    ...(values.now === undefined ? {} : { now: values.now }),
    ...(values.maxFiles === undefined ? {} : { maxFiles: values.maxFiles }),
    ...(values.maxTotalBytes === undefined ? {} : { maxTotalBytes: values.maxTotalBytes }),
    ...(values.maxDepth === undefined ? {} : { maxDepth: values.maxDepth }),
    ...(values.timeoutMs === undefined ? {} : { timeoutMs: values.timeoutMs }),
    ...(values.maxBytes === undefined ? {} : { maxBytes: values.maxBytes }),
    ...(values.maxRedirects === undefined ? {} : { maxRedirects: values.maxRedirects }),
    ...(values.cacheDirectory === undefined ? {} : { cacheDirectory: values.cacheDirectory }),
    allowHttp: values.allowHttp === true,
    allowPrivateHosts: values.allowPrivateHosts === true,
    allowNonStandardPorts: values.allowNonStandardPorts === true,
    offline: values.offline === true,
    quiet: values.quiet === true,
    help: values.help === true,
    version: values.version === true,
  };
}

function splitOption(argument: string): [string, string | undefined] {
  const separator = argument.indexOf('=');
  return separator < 0
    ? [argument, undefined]
    : [argument.slice(0, separator), argument.slice(separator + 1)];
}

function nextValue(args: readonly string[], index: number, option: string): string {
  const value = args[index];
  if (!value || value.startsWith('-')) throw new CliUsageError(`${option} requires a value.`);
  return value;
}

function parsePositive(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliUsageError(`${option} requires a positive integer.`);
  }
  return parsed;
}

function parseNonNegative(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CliUsageError(`${option} requires a non-negative integer.`);
  }
  return parsed;
}

function parseDate(value: string, option: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new CliUsageError(`${option} requires an ISO date-time.`);
  return parsed;
}

function usage(): string {
  return [
    'Usage: eom-conformance <directory> [options]',
    '',
    'Options:',
    '  --profile <name>              core, school, district, module, delegated, signed, consumer, generator, validator',
    '  --mode <mode>                 fixture, publisher, consumer, or generator',
    '  --origin <url>                run bounded publisher checks against an origin',
    '  --fixture-authority-origin <url>  expected fictional HTTPS origin for loopback fixtures',
    '  --output <file>               write the canonical report to a file',
    '  --now <date-time>             inject the report clock',
    '  --max-files <count>           capture file limit',
    '  --max-total-bytes <bytes>     capture byte limit',
    '  --max-depth <count>           capture directory depth limit',
    '  --timeout <milliseconds>      network timeout',
    '  --max-bytes <bytes>           network response limit',
    '  --max-redirects <count>       redirect limit',
    '  --cache-dir <directory>       bounded network cache directory',
    '  --allow-http                  explicit local-fixture HTTP allowance',
    '  --allow-private-hosts         explicit local-fixture private-host allowance',
    '  --allow-non-standard-ports    explicit local-fixture port allowance',
    '  --offline                     reject network publisher checks',
    '  --json --quiet --no-color --verbose',
    '  --help, -h                    show this help',
    '  --version, -V                 show the runner version',
    '',
  ].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runConformanceCli();
}
