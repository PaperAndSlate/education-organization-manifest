import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  parseStrictJson,
  stringifyCanonical,
  isJsonObject,
  type JsonObject,
} from '@paperandslate/eom-core';

const root = resolve(process.cwd());
const directory = join(root, 'vocabularies', '1.0');
const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();

function digestFor(value: JsonObject): string {
  const { contentDigest: _contentDigest, ...withoutDigest } = value;
  return `sha256:${createHash('sha256').update(stringifyCanonical(withoutDigest), 'utf8').digest('hex')}`;
}

const check = process.argv.includes('--check');
let changed = 0;
for (const file of files) {
  if (file === 'registry.json') continue;
  const path = join(directory, file);
  const value = parseStrictJson(await readFile(path, 'utf8'), path);
  if (!isJsonObject(value)) throw new Error(`${path} must contain a JSON object.`);
  const expected = digestFor(value);
  if (value.contentDigest !== expected) {
    changed += 1;
    if (!check) {
      await writeFile(path, stringifyCanonical({ ...value, contentDigest: expected }), 'utf8');
    }
  }
}

if (changed > 0 && check) {
  throw new Error(
    `${changed} vocabulary digest(s) are stale. Run pnpm generate:vocabulary-digests.`,
  );
}
process.stdout.write(
  `${check ? 'checked' : 'updated'} ${files.length - 1} vocabulary snapshot digest(s)\n`,
);
