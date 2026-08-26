import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const textExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.mjs',
  '.md',
  '.toml',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);
const failures: string[] = [];
const files = await walk(root);

for (const file of files) {
  const relativePath = relative(root, file).replaceAll('\\', '/');
  if (relativePath === 'scripts/security-check.ts') continue;
  if (!textExtensions.has(extname(file).toLowerCase())) continue;
  const contents = await readFile(file, 'utf8');
  if (/-----BEGIN [^-\r\n]+PRIVATE KEY-----/u.test(contents)) {
    failures.push(`${relativePath}: private key material is not allowed in the repository`);
  }
  if (
    /(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{20,})/u.test(contents)
  ) {
    failures.push(`${relativePath}: credential-shaped token detected`);
  }
  if (/\b(?:curl|wget)\b[^\r\n]*(?:\||;|&&)\s*(?:sh|bash|pwsh|powershell)\b/iu.test(contents)) {
    failures.push(`${relativePath}: shell-piped remote installer detected`);
  }
}

for (const file of files) {
  const relativePath = relative(root, file).replaceAll('\\', '/');
  if (/(?:^|\/)\.env(?:\.|$)/iu.test(relativePath) && !relativePath.endsWith('.env.example')) {
    failures.push(`${relativePath}: environment files must not be committed`);
  }
  if (/\.(?:pem|p12|pfx|key)$/iu.test(relativePath)) {
    failures.push(`${relativePath}: private-key/archive file extension is not allowed`);
  }
}

const workflowFiles = files.filter((file) =>
  relative(root, file).replaceAll('\\', '/').startsWith('.github/workflows/'),
);
for (const workflow of workflowFiles) {
  const contents = await readFile(workflow, 'utf8');
  const relativePath = relative(root, workflow).replaceAll('\\', '/');
  if (/pull_request_target/iu.test(contents))
    failures.push(`${relativePath}: untrusted PR workflows must not use pull_request_target`);
  if (/permissions:\s*write-all/iu.test(contents))
    failures.push(`${relativePath}: workflow permissions are broader than required`);
  if (/\bnpm\s+install\b(?![^\r\n]*--(?:frozen-lockfile|ignore-scripts))/iu.test(contents)) {
    failures.push(
      `${relativePath}: CI installs must use a frozen lockfile or explicit script policy`,
    );
  }
}

const playgroundHtml = join(root, 'apps', 'playground', 'src', 'index.html');
const playgroundApp = join(root, 'apps', 'playground', 'src', 'app.js');
try {
  const [html, app] = await Promise.all([
    readFile(playgroundHtml, 'utf8'),
    readFile(playgroundApp, 'utf8'),
  ]);
  if (!/connect-src\s+'none'/iu.test(html))
    failures.push('apps/playground/src/index.html: missing network-denying CSP');
  if (/\bfetch\s*\(|XMLHttpRequest|sendBeacon|innerHTML/iu.test(app)) {
    failures.push(
      'apps/playground/src/app.js: browser playground must remain local-only and text-safe',
    );
  }
} catch (error) {
  failures.push(
    `playground security boundary could not be read: ${error instanceof Error ? error.message : String(error)}`,
  );
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `security check passed: ${files.length} repository files inspected; intentional invalid fixtures remain quarantined under fixtures/`,
  );
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    if (['.git', 'dist', 'node_modules', '.eom-determinism'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(path)));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}
