import { access, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { isJsonObject, parseStrictJson } from '@paperandslate/eom-core';
import { lintPublication } from '@paperandslate/eom-linter';
import { validateDocument } from '@paperandslate/eom-validator';

const root = resolve(process.cwd());
const registryPath = join(root, 'modules', 'registry.json');
const registry = parseStrictJson(await readFile(registryPath, 'utf8'), registryPath);
const failures: string[] = [];
const moduleSchemaBase = 'https://paperandslate.org/schemas/eom/1.0/';
const moduleProfile = 'https://paperandslate.org/spec/eom/1.0/profiles/module';
const expected = [
  'organization',
  'campuses',
  'departments',
  'staff',
  'contacts',
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

if (!isJsonObject(registry) || !Array.isArray(registry.modules)) {
  failures.push('modules/registry.json: expected a module registry with modules');
} else {
  const registryResult = validateDocument(registry);
  if (!registryResult.valid)
    failures.push(`modules/registry.json: ${JSON.stringify(registryResult.findings)}`);
  const entries = registry.modules.filter(isJsonObject);
  if (entries.length !== expected.length)
    failures.push(`registry: expected ${expected.length} module records, found ${entries.length}`);
  const names = entries
    .map((entry) => entry.shortName)
    .filter((value): value is string => typeof value === 'string');
  const moduleUris = new Set<string>();
  const resourceTypes = new Set<string>();
  for (const name of expected)
    if (!names.includes(name)) failures.push(`registry: missing module ${name}`);
  for (const name of names)
    if (!(expected as readonly string[]).includes(name))
      failures.push(`registry: unexpected module ${name}`);
  if (new Set(names).size !== names.length)
    failures.push('registry: shortName values must be unique');

  for (const entry of entries) {
    const name = typeof entry.shortName === 'string' ? entry.shortName : '<unknown>';
    const moduleUri = typeof entry.moduleUri === 'string' ? entry.moduleUri : '';
    const resourceType = typeof entry.resourceType === 'string' ? entry.resourceType : '';
    const schemaUri = typeof entry.schema === 'string' ? entry.schema : '';
    const schemaFile = schemaUri.replace('https://paperandslate.org/schemas/eom/1.0/', '');
    const schemaPath = join(root, 'schemas', '1.0', schemaFile);
    const example = typeof entry.example === 'string' ? entry.example : '';
    const examplePath = join(root, example);

    if (moduleUri) {
      if (moduleUris.has(moduleUri)) failures.push(`${name}: moduleUri must be unique`);
      moduleUris.add(moduleUri);
      if (moduleUri !== `https://paperandslate.org/eom/modules/${name}`)
        failures.push(`${name}: moduleUri must use the stable module URI convention`);
    }
    if (resourceType) {
      if (resourceTypes.has(resourceType)) failures.push(`${name}: resourceType must be unique`);
      resourceTypes.add(resourceType);
    }
    if (entry.currentVersion !== '1.0') failures.push(`${name}: currentVersion must be 1.0`);
    if (
      !Array.isArray(entry.compatibleProtocolVersions) ||
      !entry.compatibleProtocolVersions.includes('1.0')
    ) {
      failures.push(`${name}: compatibleProtocolVersions must include 1.0`);
    }
    if (entry.conformanceProfile !== moduleProfile)
      failures.push(`${name}: conformanceProfile must be the module profile`);
    if (!Array.isArray(entry.extensionPoints) || entry.extensionPoints.length === 0)
      failures.push(`${name}: extensionPoints must contain at least one extension URI`);
    if (!Array.isArray(entry.mappings) || entry.mappings.length === 0)
      failures.push(`${name}: mappings must contain at least one mapping note`);
    if (resourceType) {
      const expectedSchemaFile =
        name === 'organization'
          ? 'organization-profile.schema.json'
          : name === 'contacts'
            ? 'contact-directory.schema.json'
            : `modules/${resourceType}.schema.json`;
      if (schemaUri !== `${moduleSchemaBase}${expectedSchemaFile}`)
        failures.push(`${name}: schema must match resourceType and the public schema layout`);
    }
    for (const requiredPath of [
      schemaPath,
      examplePath,
      join(root, 'fixtures', 'modules', name, 'valid.json'),
      join(root, 'fixtures', 'modules', name, 'invalid-unknown-property.json'),
      join(root, 'fixtures', 'modules', name, 'invalid-privacy.json'),
      join(root, 'fixtures', 'modules', name, 'invalid-security.json'),
      join(root, 'fixtures', 'modules', name, 'extension.json'),
    ]) {
      try {
        await access(requiredPath);
      } catch {
        failures.push(`${name}: missing ${relative(root, requiredPath).replaceAll('\\', '/')}`);
      }
    }
    if (!schemaFile.startsWith('modules/') && name !== 'organization' && name !== 'contacts') {
      failures.push(`${name}: module schema must be under schemas/1.0/modules`);
    }
    if (!example) continue;
    try {
      const value = parseStrictJson(await readFile(examplePath, 'utf8'), examplePath);
      if (!isJsonObject(value)) throw new Error('example must be a JSON object');
      if (value.type !== entry.resourceType)
        failures.push(`${name}: example type does not match resourceType`);
      const result = validateDocument(value);
      if (!result.valid)
        failures.push(`${name}: example failed validation ${JSON.stringify(result.findings)}`);
      const lintErrors = lintPublication(value).filter((finding) => finding.severity === 'error');
      if (lintErrors.length > 0)
        failures.push(`${name}: example has blocking lint findings ${JSON.stringify(lintErrors)}`);
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await checkFixture(name, 'valid.json', true);
    await checkFixture(name, 'invalid-unknown-property.json', false);
    await checkFixture(name, 'invalid-privacy.json', false);
    await checkFixture(name, 'invalid-security.json', false);
    await checkFixture(name, 'extension.json', true);
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `module check passed: ${expected.length} registered modules with schema, example, fixture, and extension coverage\n`,
  );
}

async function checkFixture(name: string, file: string, shouldBeValid: boolean): Promise<void> {
  const path = join(root, 'fixtures', 'modules', name, file);
  try {
    const value = parseStrictJson(await readFile(path, 'utf8'), path);
    const result = validateDocument(value);
    if (result.valid !== shouldBeValid)
      failures.push(`${name}/${file}: expected valid=${shouldBeValid}`);
    if (
      file === 'invalid-privacy.json' &&
      !lintPublication(value).some((finding) => finding.code === 'EOM_PRIVACY_PROHIBITED_FIELD')
    ) {
      failures.push(`${name}/${file}: privacy fixture did not trigger the privacy linter`);
    }
    if (
      file === 'invalid-security.json' &&
      !lintPublication(value).some((finding) => finding.code === 'EOM_SECURITY_SENSITIVE_FIELD')
    ) {
      failures.push(`${name}/${file}: security fixture did not trigger the security linter`);
    }
  } catch (error) {
    failures.push(`${name}/${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
