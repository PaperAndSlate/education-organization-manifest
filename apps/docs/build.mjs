import { access, cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const source = join(root, 'src');
const output = join(root, 'dist');
const repository = join(root, '..', '..');
const required = [
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

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
await cp(join(repository, 'spec', '1.0'), join(output, 'spec', '1.0'), { recursive: true });
await copyPublicDocs(join(repository, 'docs'), join(output, 'source-docs'));
await cp(join(repository, 'schemas', '1.0'), join(output, 'schemas', '1.0'), { recursive: true });
await cp(join(repository, 'mappings'), join(output, 'mappings'), { recursive: true });
await writeSearchIndex(output);
for (const file of required) {
  try {
    await access(join(output, file));
  } catch {
    throw new Error(`Documentation source is missing required file: ${file}`);
  }
}
await writeFile(
  join(output, 'build-metadata.json'),
  `${JSON.stringify({ name: 'eom-docs', version: '1.0.0-rc.3', generatedBy: 'apps/docs/build.mjs' }, null, 2)}\n`,
  'utf8',
);
process.stdout.write(`built static EOM docs at ${output}\n`);

async function writeSearchIndex(directory) {
  const pages = [];
  for (const file of required.filter((entry) => entry.endsWith('.html'))) {
    const html = await readFile(join(directory, file), 'utf8');
    const title = html.match(/<title>([^<]+)<\/title>/iu)?.[1]?.trim() ?? file;
    const headings = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/giu)]
      .map((match) => stripMarkup(match[1] ?? ''))
      .filter(Boolean);
    const text = stripMarkup(html).replace(/\s+/gu, ' ').trim();
    pages.push({
      title: stripMarkup(title),
      url: file,
      headings,
      excerpt: text.slice(0, 320),
    });
  }
  pages.sort((left, right) => (left.url < right.url ? -1 : left.url > right.url ? 1 : 0));
  await writeFile(
    join(directory, 'search-index.json'),
    `${JSON.stringify({ version: 1, pages }, null, 2)}\n`,
    'utf8',
  );
}

function stripMarkup(value) {
  return value
    .replace(/<script[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style[\s\S]*?<\/style>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'");
}

async function copyPublicDocs(sourceDirectory, destinationDirectory) {
  await mkdir(destinationDirectory, { recursive: true });
  const entries = (await readdir(sourceDirectory, { withFileTypes: true })).sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
  for (const entry of entries) {
    // Goal receipts are internal orchestration state and are never a public documentation artifact.
    if (entry.name === 'goals') continue;
    const sourcePath = join(sourceDirectory, entry.name);
    const destinationPath = join(destinationDirectory, entry.name);
    if (entry.isDirectory()) await copyPublicDocs(sourcePath, destinationPath);
    else if (entry.isFile()) await cp(sourcePath, destinationPath);
  }
}
