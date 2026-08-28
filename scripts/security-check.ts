import { lstat, opendir, readFile } from 'node:fs/promises';
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
const MAX_SECURITY_FILES = 100_000;
const MAX_SECURITY_DIRECTORY_ENTRIES = 100_000;
const MAX_SECURITY_DEPTH = 128;
const MAX_SECURITY_TEXT_BYTES = 16 * 1024 * 1024;
const files = await walk(root);

for (const file of files) {
  const relativePath = relative(root, file).replaceAll('\\', '/');
  if (relativePath === 'scripts/security-check.ts') continue;
  if (!textExtensions.has(extname(file).toLowerCase())) continue;
  const contents = await readBoundedText(file, relativePath);
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
  const relativePath = relative(root, workflow).replaceAll('\\', '/');
  const contents = await readBoundedText(workflow, relativePath);
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
    readBoundedText(playgroundHtml, 'apps/playground/src/index.html'),
    readBoundedText(playgroundApp, 'apps/playground/src/app.js'),
  ]);
  const remoteValidationStart = app.indexOf('async function validateWithSameOriginService()');
  const remoteValidationEnd = app.indexOf(
    '\n  function schemaOrgProjection',
    remoteValidationStart,
  );
  const remoteValidation =
    remoteValidationStart >= 0 && remoteValidationEnd > remoteValidationStart
      ? app.slice(remoteValidationStart, remoteValidationEnd)
      : '';
  if (!/connect-src\s+'self'/iu.test(html))
    failures.push('apps/playground/src/index.html: missing same-origin-only CSP');
  if (
    !remoteValidation ||
    !/service\.origin\s*!==\s*window\.location\.origin/u.test(remoteValidation) ||
    !/credentials:\s*['"]omit['"]/u.test(remoteValidation) ||
    !/redirect:\s*['"]error['"]/u.test(remoteValidation) ||
    !/\bfetch\s*\(/u.test(remoteValidation) ||
    /XMLHttpRequest|sendBeacon|innerHTML/iu.test(app)
  ) {
    failures.push(
      'apps/playground/src/app.js: browser network access must be explicit same-origin and text-safe',
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

async function walk(
  directory: string,
  state: { entries: number; files: number } = { entries: 0, files: 0 },
  depth = 0,
): Promise<string[]> {
  if (depth > MAX_SECURITY_DEPTH) {
    throw new Error(`security scan directory depth exceeds ${MAX_SECURITY_DEPTH}`);
  }
  const handle = await opendir(directory);
  const result: string[] = [];
  try {
    for await (const entry of handle) {
      if (['.git', 'dist', 'node_modules', '.eom-determinism'].includes(entry.name)) continue;
      state.entries += 1;
      if (state.entries > MAX_SECURITY_DIRECTORY_ENTRIES) {
        throw new Error(
          `security scan directory traversal exceeds ${MAX_SECURITY_DIRECTORY_ENTRIES} entries`,
        );
      }
      const path = join(directory, entry.name);
      if (entry.isDirectory()) result.push(...(await walk(path, state, depth + 1)));
      else if (entry.isFile()) {
        state.files += 1;
        if (state.files > MAX_SECURITY_FILES)
          throw new Error(`security scan exceeds ${MAX_SECURITY_FILES} files`);
        result.push(path);
      }
    }
  } finally {
    await handle.close().catch(() => undefined);
  }
  return result;
}

async function readBoundedText(path: string, label: string): Promise<string> {
  const information = await lstat(path);
  if (!information.isFile() || information.isSymbolicLink())
    throw new Error(`${label}: inspected text must be a regular file`);
  if (information.size > MAX_SECURITY_TEXT_BYTES)
    throw new Error(`${label}: inspected text exceeds the ${MAX_SECURITY_TEXT_BYTES}-byte limit`);
  const contents = await readFile(path, 'utf8');
  if (Buffer.byteLength(contents, 'utf8') > MAX_SECURITY_TEXT_BYTES)
    throw new Error(`${label}: inspected text exceeds the ${MAX_SECURITY_TEXT_BYTES}-byte limit`);
  return contents;
}
