import { readFile, readdir } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { evaluateAuthority } from '@paperandslate/eom-authority';
import {
  isJsonObject,
  migrateDocument,
  parseStrictJson,
  stringifyCanonical,
} from '@paperandslate/eom-core';
import { lintPublication } from '@paperandslate/eom-linter';
import { verifyDetached } from '@paperandslate/eom-signatures';
import { validateDocument } from '@paperandslate/eom-validator';

interface FixtureCase {
  readonly id: string;
  readonly kind: 'authority' | 'document' | 'malformed-json' | 'migration' | 'signature';
  readonly path: string;
  readonly expectedPath?: string;
  readonly expectedValid: boolean;
  readonly findingCodes?: readonly string[];
  readonly lintCodes?: readonly string[];
  readonly finalUrl?: string;
}

const root = resolve(process.cwd());
const indexPath = join(root, 'fixtures', 'conformance', 'expected', 'fixtures.json');
const index = parseStrictJson(await readFile(indexPath, 'utf8'), indexPath);
if (!isJsonObject(index) || !Array.isArray(index.cases)) {
  throw new Error('The fixture golden file must contain a cases array.');
}

const failures: string[] = [];
const seen = new Set<string>();
for (const rawCase of index.cases) {
  if (!isJsonObject(rawCase)) {
    failures.push('fixture index contains a non-object case');
    continue;
  }
  const fixtureCase = rawCase as unknown as FixtureCase;
  if (!fixtureCase.id || !fixtureCase.kind || !fixtureCase.path) {
    failures.push('fixture case requires id, kind, and path');
    continue;
  }
  if (seen.has(fixtureCase.path)) failures.push(`${fixtureCase.id}: fixture path is duplicated`);
  seen.add(fixtureCase.path);
  try {
    await runCase(fixtureCase);
  } catch (error) {
    failures.push(`${fixtureCase.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const requiredDirectories = [
  'fixtures/valid/school',
  'fixtures/valid/district',
  'fixtures/valid/delegation',
  'fixtures/valid/signatures',
  'fixtures/invalid/schema',
  'fixtures/invalid/semantic',
  'fixtures/invalid/privacy',
  'fixtures/invalid/security',
  'fixtures/invalid/delegation',
  'fixtures/invalid/signatures',
  'fixtures/http/redirects',
  'fixtures/http/caching',
  'fixtures/http/cors',
  'fixtures/http/malformed',
  'fixtures/migrations',
] as const;
for (const directory of requiredDirectories) {
  try {
    const entries = await readdir(join(root, directory));
    if (entries.every((entry) => entry === 'README.md')) {
      failures.push(`${directory}: fixture directory is empty`);
    }
  } catch (error) {
    failures.push(`${directory}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`fixture golden run passed: ${index.cases.length} cases\n`);
}

async function runCase(fixtureCase: FixtureCase): Promise<void> {
  const path = resolveFixturePath(fixtureCase.path);
  const raw = await readFile(path, 'utf8');
  if (fixtureCase.kind === 'malformed-json') {
    let parsed = true;
    try {
      parseStrictJson(raw, fixtureCase.path);
    } catch {
      parsed = false;
    }
    expectValue(fixtureCase, parsed);
    return;
  }
  const value = parseStrictJson(raw, fixtureCase.path);
  if (fixtureCase.kind === 'document') {
    const result = validateDocument(value, { now: new Date('2027-08-01T00:00:00Z') });
    expectValue(fixtureCase, result.valid);
    expectCodes(
      fixtureCase,
      result.findings.map((item) => item.code),
    );
    expectCodes(
      fixtureCase,
      lintPublication(value).map((item) => item.code),
      'lintCodes',
    );
    return;
  }
  if (fixtureCase.kind === 'authority') {
    const result = evaluateAuthority(
      {
        scope: { origin: 'https://school.example', paths: ['/'] },
        delegations: [value],
      },
      {
        type: 'meal-menu-catalog',
        id: 'https://school.example/eom/resource/meals',
        subjects: ['https://school.example/id/school'],
      },
      fixtureCase.finalUrl ?? 'https://menus.example/school/example/meals.json',
      { now: new Date('2027-08-01T00:00:00Z') },
    );
    expectValue(fixtureCase, result.accepted);
    expectCodes(
      fixtureCase,
      result.findings.map((item) => item.code),
    );
    return;
  }
  if (fixtureCase.kind === 'signature') {
    if (!isJsonObject(value)) throw new Error('signature case descriptor must be an object');
    const resourcePath = resolveFixturePath(stringField(value, 'resource'));
    const signaturePath = resolveFixturePath(stringField(value, 'signature'));
    const keySetPath = resolveFixturePath(stringField(value, 'keySet'));
    const resource = parseStrictJson(await readFile(resourcePath, 'utf8'), resourcePath);
    const signature = parseStrictJson(await readFile(signaturePath, 'utf8'), signaturePath);
    const keySet = parseStrictJson(await readFile(keySetPath, 'utf8'), keySetPath);
    if (
      !isJsonObject(signature) ||
      typeof signature.signature !== 'string' ||
      typeof signature.protected !== 'string'
    ) {
      throw new Error('signature vector must contain a signature string');
    }
    const mutatedSignature = `${signature.signature.slice(0, -1)}${
      signature.signature.endsWith('A') ? 'B' : 'A'
    }`;
    const tampered = {
      ...signature,
      signature: mutatedSignature,
      compact: `${signature.protected}..${mutatedSignature}`,
    };
    const result = verifyDetached(resource, tampered, keySet, {
      now: new Date('2027-08-01T00:00:00Z'),
    });
    expectValue(fixtureCase, result.overall);
    return;
  }
  if (fixtureCase.kind === 'migration') {
    if (!fixtureCase.expectedPath) throw new Error('migration case requires expectedPath');
    const expectedPath = resolveFixturePath(fixtureCase.expectedPath);
    const expected = parseStrictJson(await readFile(expectedPath, 'utf8'), expectedPath);
    const result = migrateDocument(value, '0.9', '1.0');
    expectValue(
      fixtureCase,
      result.changed && stringifyCanonical(result.document) === stringifyCanonical(expected),
    );
    return;
  }
  throw new Error('unsupported fixture kind');
}

function expectValue(fixtureCase: FixtureCase, actual: boolean): void {
  if (actual !== fixtureCase.expectedValid) {
    throw new Error(`expected valid=${fixtureCase.expectedValid}, observed ${actual}`);
  }
}

function expectCodes(
  fixtureCase: FixtureCase,
  actual: readonly string[],
  field: 'findingCodes' | 'lintCodes' = 'findingCodes',
): void {
  for (const expected of fixtureCase[field] ?? []) {
    if (!actual.includes(expected)) {
      throw new Error(`${field} missing ${expected}; observed ${actual.join(', ') || 'none'}`);
    }
  }
}

function stringField(value: Record<string, unknown>, field: string): string {
  const result = value[field];
  if (typeof result !== 'string') throw new Error(`${field} must be a string`);
  return result;
}

function resolveFixturePath(path: string): string {
  const candidate = resolve(root, path);
  const relativePath = relative(root, candidate);
  if (relativePath.startsWith(`..${sep}`) || relativePath === '..' || isAbsolute(path)) {
    throw new Error(`fixture path must remain below the repository root: ${path}`);
  }
  return candidate;
}
