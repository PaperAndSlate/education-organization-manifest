import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseStrictJson } from '@paperandslate/eom-core';
import { prepareReleaseArtifacts } from './generate-release-artifacts.js';

const root = resolve(process.cwd());
const releaseRoot = join(root, 'release');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'eom-release-repro-'));

try {
  const manifest = parseStrictJson(await readFile(join(releaseRoot, 'manifest.json'), 'utf8'));
  if (!isRecord(manifest) || !Array.isArray(manifest.artifacts)) {
    throw new Error(
      'release/manifest.json must contain artifacts before reproducibility can be checked.',
    );
  }
  const sourceCommit = readString(manifest.sourceCommit, 'sourceCommit');
  const sourceTree = readString(manifest.sourceTree, 'sourceTree');
  await prepareReleaseArtifacts(temporaryRoot, { sourceCommit, sourceTree });
  const paths = new Set<string>(['manifest.json']);
  for (const artifact of manifest.artifacts) {
    if (isRecord(artifact) && typeof artifact.path === 'string') paths.add(artifact.path);
  }
  const sortedPaths = [...paths].sort();
  for (const path of sortedPaths) {
    const expected = await readFile(join(releaseRoot, path));
    const reproduced = await readFile(join(temporaryRoot, path));
    if (!expected.equals(reproduced))
      throw new Error(`release artifact is not reproducible: ${path}`);
  }
  const generatedFiles = await allFiles(temporaryRoot);
  const expectedFiles = new Set(sortedPaths);
  for (const path of generatedFiles) {
    if (!expectedFiles.has(path))
      throw new Error(`reproducibility output contains an unexpected file: ${path}`);
  }
  console.log(`release reproducibility passed: ${sortedPaths.length} artifacts byte-identical`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`release/manifest.json must contain a non-empty ${field}.`);
  }
  return value;
}

async function allFiles(directory: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(join(directory, prefix), { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...(await allFiles(directory, path)));
    else if (entry.isFile()) result.push(path.replaceAll('\\', '/'));
  }
  return result.sort();
}
