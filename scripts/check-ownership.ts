import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const codeownersPath = join(root, '.github', 'CODEOWNERS');
const matrixPath = join(root, 'docs', 'governance', 'ownership-and-review.md');
const [codeowners, matrix] = await Promise.all([
  readFile(codeownersPath, 'utf8'),
  readFile(matrixPath, 'utf8'),
]);

const failures: string[] = [];
const requiredPatterns = [
  /^\/spec\/\*\*\s+\S+/mu,
  /^\/schemas\/\*\*\s+\S+/mu,
  /^\/packages\/validator\/\*\*\s+\S+/mu,
  /^\/packages\/signatures\/\*\*\s+\S+/mu,
  /^\/packages\/testkit\/\*\*\s+\S+/mu,
  /^\/release\/\*\*\s+\S+/mu,
  /^\/examples\/\*\*\/generated\/\*\*\s+\S+/mu,
];
for (const pattern of requiredPatterns) {
  if (!pattern.test(codeowners)) failures.push(`CODEOWNERS is missing ${pattern.source}`);
}
if (!codeowners.includes('/examples/ecme-high/source/')) {
  failures.push('CODEOWNERS must include an illustrative source ownership path.');
}
if (!matrix.includes('source ownership') || !matrix.includes('publication/release authority')) {
  failures.push('The ownership matrix must distinguish source ownership from release authority.');
}
for (const required of ['Required change evidence', 'External registration']) {
  if (!matrix.includes(required)) failures.push(`Ownership matrix is missing: ${required}`);
}
if (!/clean,\s*committed source revision/iu.test(matrix)) {
  failures.push('Ownership matrix must require a clean, committed source revision.');
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('ownership and review routing passed\n');
}
