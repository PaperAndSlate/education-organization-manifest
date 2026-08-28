import { randomUUID } from 'node:crypto';
import { lstat, mkdir, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, parse, resolve } from 'node:path';

/**
 * Verify that a generated-output directory is a real directory at its
 * configured path. This prevents fixed repository destinations from silently
 * following a symlink or junction into an unrelated tree.
 */
export async function ensureRealDirectory(path: string): Promise<void> {
  const information = await lstat(path);
  if (!information.isDirectory() || information.isSymbolicLink()) {
    throw new Error(`generated output directory must be a real directory: ${path}`);
  }
  const resolvedPath = resolve(path);
  const canonicalPath = await realpath(path);
  if (
    parse(canonicalPath).root.length === 0 ||
    normalizePath(canonicalPath) !== normalizePath(resolvedPath)
  ) {
    throw new Error(`generated output directory must not traverse a link: ${path}`);
  }
}

/** Create a directory tree without following a symlink or junction. */
export async function ensureRealDirectoryTree(path: string): Promise<void> {
  const resolvedPath = resolve(path);
  const missing: string[] = [];
  let current = resolvedPath;
  let stableParent: string | undefined;
  for (;;) {
    try {
      await ensureRealDirectory(current);
      stableParent = await realpath(current);
      break;
    } catch (error) {
      if (!isNotFound(error)) throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      missing.push(current);
      current = parent;
    }
  }
  for (const missingPath of missing.reverse()) {
    if (stableParent === undefined)
      throw new Error(`generated output parent is unavailable: ${path}`);
    const child = join(stableParent, basename(missingPath));
    try {
      await mkdir(child);
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
    }
    await ensureRealDirectory(child);
    stableParent = await realpath(child);
  }
}

function normalizePath(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path;
}

/** Replace a generated regular file without following an existing link. */
export async function atomicWriteFile(
  destinationPath: string,
  content: string | Uint8Array,
): Promise<void> {
  const parent = dirname(destinationPath);
  await ensureRealDirectory(parent);
  const temporaryPath = `${destinationPath}.${process.pid}.${randomUUID()}.tmp`;
  let temporaryCreated = false;
  try {
    await writeFile(temporaryPath, content, { flag: 'wx' });
    temporaryCreated = true;
    try {
      const existing = await lstat(destinationPath);
      if (existing.isSymbolicLink() || !existing.isFile()) {
        throw new Error(`generated output destination must be a regular file: ${destinationPath}`);
      }
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    // The temporary file is in the same directory, so rename replaces an
    // existing regular file atomically on the supported Node platforms. Do
    // not unlink first: that would create a deletion window if the process is
    // interrupted between the two operations.
    await rename(temporaryPath, destinationPath);
    temporaryCreated = false;
  } finally {
    if (temporaryCreated) await unlink(temporaryPath).catch(() => undefined);
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}

function isAlreadyExists(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'EEXIST'
  );
}
