import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { lintPublication } from '@paperandslate/eom-linter';
import { parseStrictJson } from '@paperandslate/eom-core';
import { validateDocument } from '@paperandslate/eom-validator';

const root = resolve(process.argv[2] ?? 'examples');
const files = await walkFiles(root);
const failures: string[] = [];
for (const file of files) {
  if (!file.endsWith('.json') && !file.endsWith('educational-organization-manifest')) continue;
  try {
    const value = parseStrictJson(await readFile(file, 'utf8'), file);
    const result = validateDocument(value, { now: new Date('2027-01-01T00:00:00Z') });
    if (!result.valid) failures.push(`${file}: ${JSON.stringify(result.findings)}`);
    const lintErrors = lintPublication(value).filter((item) => item.severity === 'error');
    if (lintErrors.length > 0) failures.push(`${file}: ${JSON.stringify(lintErrors)}`);
  } catch (error) {
    failures.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`examples valid: ${files.length} files inspected`);
}

async function walkFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== 'build') result.push(...(await walkFiles(path)));
    else if (entry.isFile()) result.push(path);
  }
  return result.sort();
}
