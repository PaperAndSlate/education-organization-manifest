import { access, readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const docsSource = join(root, 'apps', 'docs', 'src');
const docsOutput = join(root, 'apps', 'docs', 'dist');
const playgroundSource = join(root, 'apps', 'playground', 'src');
const requiredDocs = [
  'index.html',
  'publish.html',
  'consume.html',
  'reference.html',
  'integrate.html',
  'explore.html',
  'govern.html',
  'faq.html',
  'styles.css',
  'search.js',
];

for (const file of requiredDocs) {
  await access(join(docsSource, file));
  await access(join(docsOutput, file));
}
await access(join(playgroundSource, 'index.html'));
await access(join(playgroundSource, 'app.js'));
const searchIndexPath = join(docsOutput, 'search-index.json');
await access(searchIndexPath);
const searchIndex = JSON.parse(await readFile(searchIndexPath, 'utf8')) as {
  readonly version?: unknown;
  readonly pages?: unknown;
};
if (
  searchIndex.version !== 1 ||
  !Array.isArray(searchIndex.pages) ||
  searchIndex.pages.length !== requiredDocs.filter((file) => file.endsWith('.html')).length ||
  !searchIndex.pages.every(isSearchPage)
) {
  throw new Error('static documentation search index is missing or incomplete');
}

function isSearchPage(value: unknown): value is { readonly url: string; readonly title: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const page = value as Record<string, unknown>;
  return typeof page.url === 'string' && typeof page.title === 'string';
}

const htmlFiles = (await readdir(docsOutput)).filter((file) => file.endsWith('.html'));
let failures = 0;
for (const file of htmlFiles) {
  const path = join(docsOutput, file);
  const contents = await readFile(path, 'utf8');
  if (!/<html\b[^>]*\blang=/iu.test(contents)) {
    failures += 1;
    process.stderr.write(`${relative(root, path)}: missing html lang attribute\n`);
  }
  if (!/<meta\b[^>]*Content-Security-Policy/iu.test(contents)) {
    failures += 1;
    process.stderr.write(`${relative(root, path)}: missing Content-Security-Policy\n`);
  }
  for (const match of contents.matchAll(/href=["']([^"']+)["']/giu)) {
    const href = match[1];
    if (!href || href.startsWith('#') || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(href)) continue;
    const targetName = href.split('#', 1)[0] ?? '';
    const target = resolve(join(docsOutput, targetName));
    try {
      await access(target);
    } catch {
      failures += 1;
      process.stderr.write(`${relative(root, path)}: broken internal link ${href}\n`);
    }
  }
}

const markdownFiles = await walkMarkdown(root);
for (const path of markdownFiles) {
  const contents = await readFile(path, 'utf8');
  for (const match of contents.matchAll(/!?\[[^\]]*\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+[^)]*)?\s*\)/gu)) {
    const rawTarget = match[1];
    if (rawTarget === undefined) continue;
    const targetText = rawTarget.startsWith('<') ? rawTarget.slice(1, -1) : rawTarget;
    if (
      !targetText ||
      targetText.startsWith('#') ||
      targetText.startsWith('//') ||
      /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(targetText)
    ) {
      continue;
    }
    const [targetName = '', fragment] = targetText.split('#', 2);
    let decodedTarget: string;
    try {
      decodedTarget = decodeURIComponent(targetName);
    } catch {
      failures += 1;
      process.stderr.write(`${relative(root, path)}: malformed link escape ${targetText}\n`);
      continue;
    }
    const target = resolve(join(resolve(path, '..'), decodedTarget || '.'));
    if (!isWithin(root, target)) {
      failures += 1;
      process.stderr.write(`${relative(root, path)}: link escapes the repository ${targetText}\n`);
      continue;
    }
    if (!(await exists(target))) {
      failures += 1;
      process.stderr.write(`${relative(root, path)}: broken Markdown link ${targetText}\n`);
      continue;
    }
    if (fragment && !(await hasFragment(target, fragment))) {
      failures += 1;
      process.stderr.write(
        `${relative(root, path)}: missing Markdown link fragment ${targetText}\n`,
      );
    }
  }
}
const playground = await readFile(join(playgroundSource, 'app.js'), 'utf8');
const remoteValidationStart = playground.indexOf('async function validateWithSameOriginService()');
const remoteValidationEnd = playground.indexOf(
  '\n  function schemaOrgProjection',
  remoteValidationStart,
);
const remoteValidationFunction =
  remoteValidationStart >= 0 && remoteValidationEnd > remoteValidationStart
    ? playground.slice(remoteValidationStart, remoteValidationEnd)
    : '';
if (
  !remoteValidationFunction ||
  !/service\.origin\s*!==\s*window\.location\.origin/u.test(remoteValidationFunction) ||
  !/credentials:\s*['"]omit['"]/u.test(remoteValidationFunction) ||
  !/redirect:\s*['"]error['"]/u.test(remoteValidationFunction) ||
  !/\bfetch\s*\(/u.test(remoteValidationFunction) ||
  /https?:\/\/[^'"`]*\/(?:api|upload|validate)/iu.test(playground)
) {
  failures += 1;
  process.stderr.write(
    'apps/playground/src/app.js: remote validation must be an explicit same-origin, credential-free, no-redirect request\n',
  );
}
const playgroundHtml = await readFile(join(playgroundSource, 'index.html'), 'utf8');
if (
  !/connect-src\s+'self'/iu.test(playgroundHtml) ||
  /<script\b[^>]+src=["']https?:/iu.test(playgroundHtml)
) {
  failures += 1;
  process.stderr.write(
    'apps/playground/src/index.html: playground connections must be same-origin and scripts must be local\n',
  );
}
if (failures > 0) {
  process.exitCode = 1;
} else {
  process.stdout.write(
    `checked ${htmlFiles.length} static documentation pages, ${markdownFiles.length} Markdown files, and local playground boundaries\n`,
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function hasFragment(path: string, fragment: string): Promise<boolean> {
  const extension = extname(path).toLowerCase();
  if (extension !== '.md' && extension !== '.html') return true;
  const contents = await readFile(path, 'utf8');
  if (extension === '.html') {
    return new RegExp(`(?:id|name)=["']${escapeRegExp(fragment)}["']`, 'iu').test(contents);
  }
  const requested = decodeURIComponent(fragment).toLowerCase();
  const headings = [...contents.matchAll(/^#{1,6}\s+(.+)$/gmu)].map((match) =>
    slugifyHeading(match[1] ?? ''),
  );
  return headings.includes(requested);
}

function slugifyHeading(heading: string): string {
  return stripInlineMarkup(heading)
    .replace(/[`*_~]/gu, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/gu, '-');
}

function stripInlineMarkup(value: string): string {
  let output = '';
  let inTag = false;
  for (const character of value) {
    if (inTag) {
      if (character === '>') inTag = false;
    } else if (character === '<') {
      inTag = true;
    } else {
      output += character;
    }
  }
  return output;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

async function walkMarkdown(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const relativePath = relative(root, path).replaceAll('\\', '/');
    if (
      entry.isDirectory() &&
      !['.git', 'node_modules', 'dist', 'plans'].includes(entry.name) &&
      !relativePath.startsWith('docs/goals/') &&
      !relativePath.startsWith('release/v1.0.0-rc.1/')
    ) {
      files.push(...(await walkMarkdown(path)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(path);
    }
  }
  return files.sort();
}

function isWithin(parent: string, child: string): boolean {
  const value = relative(parent, child);
  return (
    value === '' || (value !== '..' && !value.startsWith(`..${'\\'}`) && !value.startsWith('../'))
  );
}
