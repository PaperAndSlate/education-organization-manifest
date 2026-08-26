import { access, cp, mkdir, rm, writeFile } from 'node:fs/promises';
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
await cp(join(repository, 'docs'), join(output, 'source-docs'), { recursive: true });
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
  `${JSON.stringify({ name: 'eom-docs', version: '0.1.0', generatedBy: 'apps/docs/build.mjs' }, null, 2)}\n`,
  'utf8',
);
process.stdout.write(`built static EOM docs at ${output}\n`);
