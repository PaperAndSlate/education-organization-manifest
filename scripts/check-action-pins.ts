import { lstat, opendir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative, resolve } from 'node:path';
import { parseDocument } from 'yaml';

const root = resolve(process.cwd());
const workflowRoot = join(root, '.github', 'workflows');
const failures: string[] = [];
const MAX_WORKFLOW_FILES = 4096;
const MAX_WORKFLOW_DIRECTORY_ENTRIES = 100_000;
const MAX_WORKFLOW_DEPTH = 128;
const MAX_WORKFLOW_BYTES = 4 * 1024 * 1024;
const verifiedPins: Readonly<Record<string, string>> = {
  'actions/checkout': 'fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09',
  'actions/dependency-review-action': 'ce3cf9537a52e8119d91fd484ab5b8a807627bf8',
  'actions/setup-node': 'a0853c24544627f65ddf259abe73b1d18a591444',
  'actions/upload-artifact': '330a01c490aca151604b8cf639adc76d48f6c5d4',
  'fsfe/reuse-action': '676e2d560c9a403aa252096d99fcab3e1132b0f5',
  'github/codeql-action': 'b56ba49b26e50535fa1e7f7db0f4f7b4bf65d80d',
  'gitleaks/gitleaks-action': 'ff98106e4c7b2bc287b24eaf42907196329070c7',
  'pnpm/action-setup': '7088e561eb65bb68695d245aa206f005ef30921d',
};

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  await main();
}

async function main(): Promise<void> {
  for (const file of await walk(workflowRoot)) {
    const relativePath = relative(root, file).replaceAll('\\', '/');
    const contents = await readBoundedText(file, relativePath);
    failures.push(...checkWorkflowActionPins(contents, relativePath));
  }

  async function readBoundedText(path: string, label: string): Promise<string> {
    const information = await lstat(path);
    if (!information.isFile() || information.isSymbolicLink())
      throw new Error(`${label}: workflow must be a regular file`);
    if (information.size > MAX_WORKFLOW_BYTES)
      throw new Error(`${label}: workflow exceeds the ${MAX_WORKFLOW_BYTES}-byte limit`);
    const contents = await readFile(path, 'utf8');
    if (Buffer.byteLength(contents, 'utf8') > MAX_WORKFLOW_BYTES)
      throw new Error(`${label}: workflow exceeds the ${MAX_WORKFLOW_BYTES}-byte limit`);
    return contents;
  }

  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(
      'GitHub Actions pin check passed: every workflow action uses a verified commit SHA',
    );
  }
}

async function walk(
  directory: string,
  state: { entries: number; files: number } = { entries: 0, files: 0 },
  depth = 0,
): Promise<string[]> {
  if (depth > MAX_WORKFLOW_DEPTH)
    throw new Error(`workflow directory depth exceeds ${MAX_WORKFLOW_DEPTH}`);
  const handle = await opendir(directory);
  const result: string[] = [];
  try {
    for await (const entry of handle) {
      state.entries += 1;
      if (state.entries > MAX_WORKFLOW_DIRECTORY_ENTRIES)
        throw new Error(
          `workflow directory traversal exceeds ${MAX_WORKFLOW_DIRECTORY_ENTRIES} entries`,
        );
      const path = join(directory, entry.name);
      if (entry.isDirectory()) result.push(...(await walk(path, state, depth + 1)));
      else if (entry.isFile() && /\.ya?ml$/iu.test(entry.name)) {
        state.files += 1;
        if (state.files > MAX_WORKFLOW_FILES)
          throw new Error(`workflow file count exceeds ${MAX_WORKFLOW_FILES}`);
        result.push(path);
      }
    }
  } finally {
    await handle.close().catch(() => undefined);
  }
  return result.sort();
}

export function checkWorkflowActionPins(contents: string, relativePath: string): string[] {
  const failures: string[] = [];
  let document;
  try {
    document = parseDocument(contents, {
      strict: true,
      uniqueKeys: true,
      prettyErrors: true,
    });
    if (document.errors.length > 0) {
      failures.push(
        `${relativePath}: invalid workflow YAML (${document.errors.map((error) => error.message).join(' ')})`,
      );
      return failures;
    }
    const value: unknown = document.toJS({ maxAliasCount: 0 });
    inspectUses(value, relativePath, failures, '');
  } catch (error) {
    failures.push(
      `${relativePath}: invalid workflow YAML (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  return failures;
}

function inspectUses(
  value: unknown,
  relativePath: string,
  failures: string[],
  pointer: string,
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      inspectUses(item, relativePath, failures, `${pointer}/${index}`),
    );
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPointer = `${pointer}/${key}`;
    if (key === 'uses') {
      if (typeof child !== 'string') {
        failures.push(
          `${relativePath}${childPointer}: uses must be a string pinned to a commit SHA`,
        );
      } else {
        checkReference(child, relativePath, failures, childPointer);
      }
    }
    inspectUses(child, relativePath, failures, childPointer);
  }
}

function checkReference(
  reference: string,
  relativePath: string,
  failures: string[],
  pointer: string,
): void {
  const at = reference.lastIndexOf('@');
  const action = at > 0 ? reference.slice(0, at) : reference;
  const pin = at > 0 ? reference.slice(at + 1) : '';
  if (!/^[0-9a-f]{40}$/iu.test(pin)) {
    failures.push(
      `${relativePath}${pointer}: ${reference} is not pinned to a 40-character commit SHA`,
    );
    return;
  }
  const actionRoot = action.split('/').slice(0, 2).join('/');
  const expected = verifiedPins[action] ?? verifiedPins[actionRoot];
  if (!expected)
    failures.push(`${relativePath}${pointer}: ${action} is not in the verified action pin list`);
  else if (pin.toLowerCase() !== expected)
    failures.push(
      `${relativePath}${pointer}: ${action} uses ${pin}, expected verified ${expected}`,
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
