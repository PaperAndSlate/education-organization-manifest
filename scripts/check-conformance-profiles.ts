import { access, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isJsonObject, parseStrictJson } from '@paperandslate/eom-core';
import { validateDocument } from '@paperandslate/eom-validator';

const root = resolve(process.cwd());
const registryPath = join(root, 'conformance', 'registry.json');
const expected = [
  'core-publisher',
  'school-publisher',
  'district-publisher',
  'module',
  'delegated-publisher',
  'signed-publisher',
  'consumer',
  'generator',
  'validator',
] as const;
const failures: string[] = [];

try {
  await access(registryPath);
  const registry = parseStrictJson(await readFile(registryPath, 'utf8'), registryPath);
  const result = validateDocument(registry);
  if (!result.valid) failures.push(`conformance/registry.json: ${JSON.stringify(result.findings)}`);
  if (!isJsonObject(registry) || !Array.isArray(registry.profiles)) {
    failures.push('conformance/registry.json must contain profiles.');
  } else {
    const profiles = registry.profiles.filter(isJsonObject);
    const ids = profiles
      .map((profile) => (typeof profile.id === 'string' ? profile.id.split('/').at(-1) : undefined))
      .filter((value): value is string => value !== undefined);
    for (const name of expected) if (!ids.includes(name)) failures.push(`missing profile ${name}`);
    if (new Set(ids).size !== ids.length) failures.push('profile IDs must be unique.');
    for (const profile of profiles) {
      const id = typeof profile.id === 'string' ? profile.id : '<unknown>';
      if (profile.type !== 'conformance-profile') failures.push(`${id}: wrong type`);
      if (profile.version !== '1.0') failures.push(`${id}: wrong version`);
      if (profile.externalEvidenceRequired !== false)
        failures.push(`${id}: local profile must not imply external evidence`);
    }
  }
} catch (error) {
  failures.push(
    `conformance registry could not be checked: ${error instanceof Error ? error.message : String(error)}`,
  );
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `conformance profile registry passed: ${expected.length} versioned profiles\n`,
  );
}
