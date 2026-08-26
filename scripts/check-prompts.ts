import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';

type PromptEntry = {
  readonly id?: unknown;
  readonly path?: unknown;
  readonly kind?: unknown;
  readonly safetyClass?: unknown;
};

type PromptCatalog = {
  readonly version?: unknown;
  readonly defaultPublicationMode?: unknown;
  readonly compatibleEomVersion?: unknown;
  readonly lastReviewed?: unknown;
  readonly inputContract?: unknown;
  readonly outputContract?: unknown;
  readonly prompts?: unknown;
};

const root = resolve(process.cwd());
const catalogPath = join(root, 'prompts', 'prompt-catalog.yaml');
const catalog = parse(await readFile(catalogPath, 'utf8')) as PromptCatalog;
const failures: string[] = [];

for (const [name, value] of Object.entries({
  version: catalog.version,
  defaultPublicationMode: catalog.defaultPublicationMode,
  compatibleEomVersion: catalog.compatibleEomVersion,
  lastReviewed: catalog.lastReviewed,
  inputContract: catalog.inputContract,
  outputContract: catalog.outputContract,
})) {
  if (typeof value !== 'string' || value.length === 0) failures.push(`${name} is required`);
}

if (!Array.isArray(catalog.prompts) || catalog.prompts.length === 0) {
  failures.push('prompts must be a non-empty array');
} else {
  const ids = new Set<string>();
  for (const [index, raw] of catalog.prompts.entries()) {
    const entry = raw as PromptEntry;
    const id = typeof entry.id === 'string' ? entry.id : undefined;
    const path = typeof entry.path === 'string' ? entry.path : undefined;
    if (!id || !path || typeof entry.kind !== 'string' || typeof entry.safetyClass !== 'string') {
      failures.push(`prompts[${index}] must include id, path, kind, and safetyClass`);
      continue;
    }
    if (ids.has(id)) failures.push(`duplicate prompt id ${id}`);
    ids.add(id);
    const filePath = join(root, 'prompts', path);
    try {
      await stat(filePath);
      const firstLine = (await readFile(filePath, 'utf8')).split(/\r?\n/u)[0] ?? '';
      if (firstLine !== `PROMPT ID: ${id}`) {
        failures.push(`${path} must start with PROMPT ID: ${id}`);
      }
    } catch {
      failures.push(`missing prompt file ${path}`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `checked ${Array.isArray(catalog.prompts) ? catalog.prompts.length : 0} versioned prompts\n`,
  );
}
