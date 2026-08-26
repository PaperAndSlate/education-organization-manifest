import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import * as addFormatsModule from 'ajv-formats';
import { parseStrictJson, isJsonObject } from '@paperandslate/eom-core';

const root = resolve(process.cwd());
const directory = join(root, 'schemas', '1.0');
const schemaFiles = (await readdir(directory, { recursive: true }))
  .filter((file) => file.endsWith('.schema.json'))
  .sort();
type AddFormats = (ajv: Ajv2020) => unknown;
const addFormats =
  (addFormatsModule as unknown as { default?: AddFormats }).default ??
  (addFormatsModule as unknown as AddFormats);
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
  validateFormats: true,
});
addFormats(ajv);
let failures = 0;
for (const file of schemaFiles) {
  const path = join(directory, file);
  try {
    const value = parseStrictJson(await readFile(path, 'utf8'), path);
    if (
      !isJsonObject(value) ||
      typeof value.$id !== 'string' ||
      value.$schema !== 'https://json-schema.org/draft/2020-12/schema'
    ) {
      throw new Error('schema must be an object with a draft 2020-12 $schema and absolute $id');
    }
    ajv.addSchema(value);
  } catch (error) {
    failures += 1;
    process.stderr.write(`${file}: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}
for (const file of schemaFiles) {
  const path = join(directory, file);
  try {
    const value = parseStrictJson(await readFile(path, 'utf8'), path);
    if (!isJsonObject(value) || typeof value.$id !== 'string') continue;
    ajv.getSchema(value.$id) ?? ajv.compile(value);
  } catch (error) {
    failures += 1;
    process.stderr.write(
      `${file}: cannot compile: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}
if (failures > 0) {
  process.exitCode = 1;
} else {
  process.stdout.write(`checked ${schemaFiles.length} JSON Schema 2020-12 files\n`);
}
