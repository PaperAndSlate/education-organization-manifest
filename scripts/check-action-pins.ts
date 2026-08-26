import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const workflowRoot = join(root, '.github', 'workflows');
const failures: string[] = [];
const verifiedPins: Readonly<Record<string, string>> = {
  'actions/checkout': '11bd71901bbe5b1630ceea73d27597364c9af683',
  'actions/dependency-review-action': 'ce3cf9537a52e8119d91fd484ab5b8a807627bf8',
  'actions/setup-node': '49933ea5288caeca8642d1e84afbd3f7d6820020',
  'actions/upload-artifact': '65c4c4a1ddee5b72f698fdd19549f0f0fb45cf08',
  'fsfe/reuse-action': 'bb774aa972c2a89ff34781233d275075cbddf542',
  'github/codeql-action': 'b56ba49b26e50535fa1e7f7db0f4f7b4bf65d80d',
  'gitleaks/gitleaks-action': 'ff98106e4c7b2bc287b24eaf42907196329070c7',
  'pnpm/action-setup': '7088e561eb65bb68695d245aa206f005ef30921d',
};

for (const file of await walk(workflowRoot)) {
  const contents = await readFile(file, 'utf8');
  const relativePath = relative(root, file).replaceAll('\\', '/');
  for (const match of contents.matchAll(/^\s*uses:\s*([^\s#]+)\s*#?([^\r\n]*)$/gmu)) {
    const reference = match[1];
    if (!reference) continue;
    const at = reference.lastIndexOf('@');
    const action = at > 0 ? reference.slice(0, at) : reference;
    const pin = at > 0 ? reference.slice(at + 1) : '';
    if (!/^[0-9a-f]{40}$/iu.test(pin)) {
      failures.push(`${relativePath}: ${reference} is not pinned to a 40-character commit SHA`);
      continue;
    }
    const actionRoot = action.split('/').slice(0, 2).join('/');
    const expected = verifiedPins[action] ?? verifiedPins[actionRoot];
    if (!expected)
      failures.push(`${relativePath}: ${action} is not in the verified action pin list`);
    else if (pin.toLowerCase() !== expected) {
      failures.push(`${relativePath}: ${action} uses ${pin}, expected verified ${expected}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('GitHub Actions pin check passed: every workflow action uses a verified commit SHA');
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(path)));
    else if (entry.isFile() && /\.ya?ml$/iu.test(entry.name)) result.push(path);
  }
  return result.sort();
}
