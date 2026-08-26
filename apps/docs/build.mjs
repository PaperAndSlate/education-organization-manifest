import { access, cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
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
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
await cp(join(repository, 'spec', '1.0'), join(output, 'spec', '1.0'), { recursive: true });
await copyPublicDocs(join(repository, 'docs'), join(output, 'source-docs'));
await cp(join(repository, 'schemas', '1.0'), join(output, 'schemas', '1.0'), { recursive: true });
await cp(join(repository, 'mappings'), join(output, 'mappings'), { recursive: true });
for (const file of required) {
  try {
    await access(join(output, file));
  } catch {
    throw new Error(`Documentation source is missing required file: ${file}`);
  }
}
await writeFile(
  join(output, 'build-metadata.json'),
  `${JSON.stringify({ name: 'eom-docs', version: '1.0.0-rc.2', generatedBy: 'apps/docs/build.mjs' }, null, 2)}\n`,
  'utf8',
);
process.stdout.write(`built static EOM docs at ${output}\n`);

async function copyPublicDocs(sourceDirectory, destinationDirectory) {
  await mkdir(destinationDirectory, { recursive: true });
  const entries = (await readdir(sourceDirectory, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name),
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
