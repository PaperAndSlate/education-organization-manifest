import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { buildPublication } from '@paperandslate/eom-generator';

const sourceDirectory = resolve(process.argv[2] ?? 'examples/ecme-high/source');
const temporaryRoot = resolve('.eom-determinism');
const sourceConfigName = basename(join(sourceDirectory, 'eom.config.yaml'));
const firstOutput = join(temporaryRoot, 'first', 'public');
const secondOutput = join(temporaryRoot, 'second', 'public');
const firstSource = join(temporaryRoot, 'first', 'source');
const secondSource = join(temporaryRoot, 'second', 'source');

try {
  await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  await copySourceTree(sourceDirectory, firstSource, false);
  await copySourceTree(sourceDirectory, secondSource, true);
  const firstConfigFile = join(firstSource, sourceConfigName);
  const secondConfigFile = join(secondSource, sourceConfigName);
  const originalTimezone = process.env.TZ;
  process.env.TZ = 'UTC';
  const first = await buildPublication({
    configFile: firstConfigFile,
    outputRoot: firstOutput,
    allowExternalOutput: true,
    now: new Date('2027-01-01T00:00:00Z'),
  });
  process.env.TZ = 'America/Los_Angeles';
  const second = await buildPublication({
    configFile: secondConfigFile,
    outputRoot: secondOutput,
    allowExternalOutput: true,
    now: new Date('2027-01-01T00:00:00Z'),
  });
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
  if (!first.valid || !second.valid) {
    console.error(JSON.stringify({ first, second }, null, 2));
    process.exitCode = 1;
  } else {
    const firstFiles = await filesWithBytes(firstOutput);
    const secondFiles = await filesWithBytes(secondOutput);
    const names = [...new Set([...firstFiles.keys(), ...secondFiles.keys()])].sort();
    const differences = names.filter((name) => {
      const left = firstFiles.get(name);
      const right = secondFiles.get(name);
      return !left || !right || !left.equals(right);
    });
    if (differences.length > 0) {
      console.error(`Non-deterministic generated files: ${differences.join(', ')}`);
      process.exitCode = 1;
    } else {
      console.log(`deterministic: ${names.length} generated files`);
    }
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

async function copySourceTree(
  source: string,
  destination: string,
  reverse: boolean,
): Promise<void> {
  await mkdir(destination, { recursive: true });
  const entries = (await readdir(source, { withFileTypes: true })).sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
  if (reverse) entries.reverse();
  for (const entry of entries) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    if (entry.isDirectory()) {
      await copySourceTree(sourcePath, destinationPath, reverse);
    } else if (entry.isFile()) {
      await cp(sourcePath, destinationPath);
    } else {
      throw new Error(`Unsupported source entry in determinism fixture: ${sourcePath}`);
    }
  }
}

async function filesWithBytes(root: string): Promise<Map<string, Buffer>> {
  const result = new Map<string, Buffer>();
  for (const path of await walkFiles(root)) {
    result.set(relative(root, path).replaceAll('\\', '/'), await readFile(path));
  }
  return result;
}

async function walkFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await walkFiles(path)));
    else if (entry.isFile()) result.push(path);
  }
  return result.sort();
}
