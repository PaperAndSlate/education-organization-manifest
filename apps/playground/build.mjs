import { access, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const source = join(root, 'src');
const output = join(root, 'dist');
const required = ['index.html', 'app.js', 'styles.css'];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
for (const file of required) {
  try {
    await access(join(output, file));
  } catch {
    throw new Error(`Playground source is missing required file: ${file}`);
  }
}
await writeFile(
  join(output, 'build-metadata.json'),
  `${JSON.stringify({ name: 'eom-playground', version: '0.1.0', generatedBy: 'apps/playground/build.mjs' }, null, 2)}\n`,
  'utf8',
);
process.stdout.write(`built local EOM playground at ${output}\n`);
