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
  'styles.css',
];

for (const file of requiredDocs) {
  await access(join(docsSource, file));
  await access(join(docsOutput, file));
}
await access(join(playgroundSource, 'index.html'));
await access(join(playgroundSource, 'app.js'));

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
const playground = await readFile(join(playgroundSource, 'app.js'), 'utf8');
if (
  /\bfetch\s*\(/u.test(playground) ||
  /https?:\/\/[^'"`]*\/(?:api|upload|validate)/iu.test(playground)
) {
  failures += 1;
  process.stderr.write(
    'apps/playground/src/app.js: browser playground must not make network validation calls\n',
  );
}
const playgroundHtml = await readFile(join(playgroundSource, 'index.html'), 'utf8');
if (
  !/connect-src\s+'none'/iu.test(playgroundHtml) ||
  /<script\b[^>]+src=["']https?:/iu.test(playgroundHtml)
) {
  failures += 1;
  process.stderr.write(
    'apps/playground/src/index.html: local playground must be network-isolated\n',
  );
}
if (failures > 0) {
  process.exitCode = 1;
} else {
  process.stdout.write(
    `checked ${htmlFiles.length} static documentation pages and local playground boundaries\n`,
  );
}
