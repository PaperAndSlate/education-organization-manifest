import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { buildPublication } from '@paperandslate/eom-generator';
import { isJsonObject, parseStrictJson } from '@paperandslate/eom-core';
import {
  runConformance,
  type ConformanceCheck,
  type ConformanceProfileName,
} from '@paperandslate/eom-testkit';

const root = resolve(process.cwd());
const expectedPath = join(root, 'fixtures', 'conformance', 'expected', 'profiles.json');
const expected = parseStrictJson(await readFile(expectedPath, 'utf8'), expectedPath);
if (!isJsonObject(expected) || !Array.isArray(expected.cases)) {
  throw new Error('The conformance profile golden file must contain cases.');
}

const failures: string[] = [];
for (const value of expected.cases) {
  if (!isJsonObject(value)) {
    failures.push('The conformance profile golden file contains a non-object case.');
    continue;
  }
  const id = typeof value.id === 'string' ? value.id : '<unknown>';
  const profile = typeof value.profile === 'string' ? value.profile : undefined;
  const directory = typeof value.directory === 'string' ? value.directory : undefined;
  const expectedStatus = typeof value.status === 'string' ? value.status : undefined;
  if (!profile || !directory || !expectedStatus) {
    failures.push(`${id}: case requires profile, directory, and status.`);
    continue;
  }
  let temporaryRoot: string | undefined;
  try {
    let capture = resolve(root, directory);
    if (id === 'ecme-generator') {
      temporaryRoot = await mkdtemp(join(tmpdir(), 'eom-conformance-generator-'));
      const buildOptions = (outputRoot: string) => ({
        configFile: join(root, 'examples', 'ecme-high', 'source', 'eom.config.yaml'),
        outputRoot,
        allowExternalOutput: true,
        deterministic: true,
        now: new Date('2027-01-01T00:00:00Z'),
      });
      const firstOutput = join(temporaryRoot, 'first', 'public');
      const secondOutput = join(temporaryRoot, 'second', 'public');
      const [first, second] = await Promise.all([
        buildPublication(buildOptions(firstOutput)),
        buildPublication(buildOptions(secondOutput)),
      ]);
      if (!first.valid || !first.written || !second.valid || !second.written) {
        failures.push(`${id}: generator did not produce a valid capture.`);
        continue;
      }
      const differences = await compareTrees(firstOutput, secondOutput);
      if (differences.length > 0) {
        failures.push(`${id}: deterministic outputs differ: ${differences.join(', ')}`);
      }
      capture = firstOutput;
    }
    const report = await runConformance({
      directory: capture,
      profile: profile as ConformanceProfileName,
      now: new Date('2027-08-01T00:00:00Z'),
      implementationSource: 'https://paperandslate.org/eom/reference-implementation',
    });
    if (report.status !== expectedStatus) {
      failures.push(`${id}: expected ${expectedStatus}, observed ${report.status}.`);
    }
    const requiredChecks = Array.isArray(value.checks)
      ? value.checks.filter((item): item is string => typeof item === 'string')
      : [];
    for (const check of requiredChecks) {
      const observed = report.checks.find((item) => checkIdMatches(item, check));
      if (!observed || observed.status !== 'pass') {
        failures.push(`${id}: expected ${check}=pass, observed ${observed?.status ?? 'missing'}.`);
      }
    }
  } catch (error) {
    failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (temporaryRoot)
      await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`conformance profile golden run passed: ${expected.cases.length} cases\n`);
}

function checkIdMatches(check: ConformanceCheck, expectedId: string): boolean {
  return (
    check.id === expectedId ||
    check.id.endsWith(`/checks/${expectedId}`) ||
    check.id.includes(`/checks/${expectedId}/`)
  );
}

async function compareTrees(first: string, second: string): Promise<readonly string[]> {
  const firstFiles = await treeFiles(first);
  const secondFiles = await treeFiles(second);
  const names = [...new Set([...firstFiles.keys(), ...secondFiles.keys()])].sort();
  return names.filter((name) => {
    const left = firstFiles.get(name);
    const right = secondFiles.get(name);
    return left === undefined || right === undefined || !left.equals(right);
  });
}

async function treeFiles(directory: string): Promise<Map<string, Buffer>> {
  const result = new Map<string, Buffer>();
  async function visit(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile())
        result.set(relative(directory, path).replaceAll('\\', '/'), await readFile(path));
    }
  }
  await visit(directory);
  return result;
}
