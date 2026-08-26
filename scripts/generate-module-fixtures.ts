import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  isJsonObject,
  parseStrictJson,
  stringifyCanonical,
  type JsonObject,
} from '@paperandslate/eom-core';

const root = resolve(process.cwd());
const registryPath = join(root, 'modules', 'registry.json');
const registry = parseStrictJson(await readFile(registryPath, 'utf8'), registryPath);
if (!isJsonObject(registry) || !Array.isArray(registry.modules)) {
  throw new Error('modules/registry.json must contain a modules array.');
}

const checkOnly = process.argv.includes('--check');
let changed = 0;
for (const entry of registry.modules) {
  if (
    !isJsonObject(entry) ||
    typeof entry.shortName !== 'string' ||
    typeof entry.example !== 'string'
  ) {
    throw new Error('Every registry entry needs a shortName and example.');
  }
  const sourcePath = join(root, entry.example);
  const source = parseStrictJson(await readFile(sourcePath, 'utf8'), sourcePath);
  if (!isJsonObject(source)) throw new Error(`${sourcePath} must contain an object.`);
  const directory = join(root, 'fixtures', 'modules', entry.shortName);
  const files: Record<string, JsonObject> = {
    'valid.json': source,
    'invalid-unknown-property.json': { ...source, unexpectedProperty: true },
    'invalid-privacy.json': withPrivacyMarker(source),
    'extension.json': withExtension(source),
  };
  for (const [name, value] of Object.entries(files)) {
    const path = join(directory, name);
    const content = stringifyCanonical(value);
    let existing: string | undefined;
    try {
      existing = await readFile(path, 'utf8');
    } catch {
      // The fixture is created below.
    }
    if (existing !== content) {
      changed += 1;
      if (!checkOnly) {
        await mkdir(directory, { recursive: true });
        await writeFile(path, content, 'utf8');
      }
    }
  }
}

if (changed > 0 && checkOnly) {
  throw new Error(
    `${changed} module fixture file(s) are stale. Run pnpm generate:module-fixtures.`,
  );
}
process.stdout.write(
  `${checkOnly ? 'checked' : 'generated'} module fixture corpus for ${registry.modules.length} modules\n`,
);

function withPrivacyMarker(source: JsonObject): JsonObject {
  const items = Array.isArray(source.items) ? source.items : [];
  if (items.length > 0 && isJsonObject(items[0])) {
    return {
      ...source,
      items: [
        { ...items[0], studentId: 'https://student.example/id/never-publish' },
        ...items.slice(1),
      ],
    };
  }
  return { ...source, studentId: 'https://student.example/id/never-publish' };
}

function withExtension(source: JsonObject): JsonObject {
  return {
    ...source,
    extensions: {
      ...(isJsonObject(source.extensions) ? source.extensions : {}),
      'https://fixture.example/eom/extensions/module-test': { value: 'preserved' },
    },
  };
}
