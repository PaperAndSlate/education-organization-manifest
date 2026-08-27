import { lstat, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, parse, relative, resolve } from 'node:path';
import { parseStrictJson } from '@paperandslate/eom-core';
import { prepareReleaseArtifacts } from './generate-release-artifacts.js';

const root = resolve(process.cwd());
const releaseRoot = join(root, 'release');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'eom-release-repro-'));

try {
  await assertSafeReleaseRoot();
  const manifest = parseStrictJson(
    (await readReleaseFile(join(releaseRoot, 'manifest.json'))).toString('utf8'),
    'release/manifest.json',
  );
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
    const expected = await readReleaseFile(join(releaseRoot, path));
    const reproduced = await readTemporaryFile(join(temporaryRoot, path));
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
    const information = await lstat(join(directory, path));
    if (information.isSymbolicLink()) {
      throw new Error(`reproducibility output contains a symlink: ${path}`);
    }
    if (information.isDirectory()) result.push(...(await allFiles(directory, path)));
    else if (information.isFile()) result.push(path.replaceAll('\\', '/'));
    else throw new Error(`reproducibility output contains a non-regular file: ${path}`);
  }
  return result.sort();
}

async function assertSafeReleaseRoot(): Promise<void> {
  const information = await lstat(releaseRoot);
  if (information.isSymbolicLink() || !information.isDirectory()) {
    throw new Error('release/ must be a real directory, not a symlink or junction.');
  }
  const resolvedReleaseRoot = await realpath(releaseRoot);
  if (normalizeFsPath(resolvedReleaseRoot) !== normalizeFsPath(releaseRoot)) {
    throw new Error('release/ must not resolve through a symlink or junction.');
  }
}

async function readReleaseFile(path: string): Promise<Buffer> {
  const information = await lstat(path);
  if (information.isSymbolicLink() || !information.isFile()) {
    throw new Error(`Release evidence must contain regular files only: ${path}`);
  }
  const releaseDirectory = await realpath(releaseRoot);
  const resolvedFile = await realpath(path);
  if (!isWithin(releaseDirectory, resolvedFile)) {
    throw new Error(`Release evidence escapes release/: ${path}`);
  }
  return readFile(path);
}

async function readTemporaryFile(path: string): Promise<Buffer> {
  const information = await lstat(path);
  if (information.isSymbolicLink() || !information.isFile()) {
    throw new Error(`reproducibility output must contain regular files only: ${path}`);
  }
  const resolvedTemporaryRoot = await realpath(temporaryRoot);
  const resolvedFile = await realpath(path);
  if (!isWithin(resolvedTemporaryRoot, resolvedFile)) {
    throw new Error(`reproducibility output escapes its temporary root: ${path}`);
  }
  return readFile(path);
}

function isWithin(parent: string, child: string): boolean {
  const parentPath = normalizeFsPath(parent);
  const childPath = normalizeFsPath(child);
  const suffix = relative(parentPath, childPath);
  return suffix === '' || (!suffix.startsWith('..') && !parse(suffix).root);
}

function normalizeFsPath(value: string): string {
  const resolved = resolve(value);
  return process.platform === 'win32' ? resolved.replaceAll('/', '\\').toLowerCase() : resolved;
}
