import { readFile, readdir, rm } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { buildPublication } from '@paperandslate/eom-generator';

const sourceDirectory = resolve(process.argv[2] ?? 'examples/ecme-high/source');
const temporaryRoot = resolve('.eom-determinism');
const firstOutput = join(temporaryRoot, 'first', 'public');
const secondOutput = join(temporaryRoot, 'second', 'public');

try {
  await rm(temporaryRoot, { recursive: true, force: true });
  const configFile = join(sourceDirectory, 'eom.config.yaml');
  const [first, second] = await Promise.all([
    buildPublication({
      configFile,
      outputRoot: firstOutput,
      now: new Date('2027-01-01T00:00:00Z'),
    }),
    buildPublication({
      configFile,
      outputRoot: secondOutput,
      now: new Date('2027-01-01T00:00:00Z'),
    }),
  ]);
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
  await rm(temporaryRoot, { recursive: true, force: true });
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
