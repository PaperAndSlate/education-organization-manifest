import { lstat, readFile, realpath } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { parseDocument } from 'yaml';

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
const promptsRoot = join(root, 'prompts');
const MAX_PROMPT_FILE_BYTES = 4 * 1024 * 1024;
const catalogText = await readBoundedText(catalogPath, 'prompts/prompt-catalog.yaml');
const catalogDocument = parseDocument(catalogText, {
  strict: true,
  uniqueKeys: true,
  prettyErrors: true,
});
if (catalogDocument.errors.length > 0) {
  throw new Error(
    `invalid prompt catalog YAML: ${catalogDocument.errors.map((error) => error.message).join(' ')}`,
  );
}
const catalog = catalogDocument.toJS({ maxAliasCount: 0 }) as PromptCatalog;
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
    const filePath = resolve(promptsRoot, path);
    try {
      const canonicalPromptsRoot = await realpath(promptsRoot);
      const canonicalFilePath = await realpath(filePath);
      const suffix = relative(canonicalPromptsRoot, canonicalFilePath);
      if (
        suffix === '..' ||
        suffix.startsWith(`..${'\\'}`) ||
        suffix.startsWith('../') ||
        suffix.length === 0
      ) {
        throw new Error('prompt path escapes the prompt directory');
      }
      const firstLine = (await readBoundedText(filePath, path)).split(/\r?\n/u)[0] ?? '';
      if (firstLine !== `PROMPT ID: ${id}`) {
        failures.push(`${path} must start with PROMPT ID: ${id}`);
      }
    } catch {
      failures.push(`missing prompt file ${path}`);
    }
  }
}

async function readBoundedText(path: string, label: string): Promise<string> {
  const information = await lstat(path);
  if (!information.isFile() || information.isSymbolicLink())
    throw new Error(`${label}: prompt must be a regular file`);
  if (information.size > MAX_PROMPT_FILE_BYTES)
    throw new Error(`${label}: prompt exceeds the ${MAX_PROMPT_FILE_BYTES}-byte limit`);
  const contents = await readFile(path, 'utf8');
  if (Buffer.byteLength(contents, 'utf8') > MAX_PROMPT_FILE_BYTES)
    throw new Error(`${label}: prompt exceeds the ${MAX_PROMPT_FILE_BYTES}-byte limit`);
  return contents;
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `checked ${Array.isArray(catalog.prompts) ? catalog.prompts.length : 0} versioned prompts\n`,
  );
}
