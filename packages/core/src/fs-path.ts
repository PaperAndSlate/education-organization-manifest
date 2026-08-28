import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { relative, resolve, sep } from 'node:path';

/**
 * Normalize a filesystem path for identity comparisons without treating the
 * operating system's own temporary-directory alias as an unsafe link.
 *
 * macOS commonly exposes the process temporary directory through /var while
 * its canonical path is under /private/var, and Windows runners may expose it
 * through an 8.3 short path. The alias is trusted because it is the directory
 * selected by Node for temporary files; links introduced below that directory
 * still produce a different canonical path and remain rejected by callers.
 */
export function normalizeFsPath(value: string): string {
  const resolved = resolve(value);
  const normalized = normalizeRaw(resolved);

  const temporaryAlias = resolve(tmpdir());
  const temporaryCanonical = safeRealpath(temporaryAlias);
  if (temporaryCanonical === undefined) return normalized;

  const relativePath = relative(temporaryAlias, resolved);
  if (!isDescendantOrSame(relativePath)) return normalized;

  return normalizeRaw(resolve(temporaryCanonical, relativePath));
}

function safeRealpath(path: string): string | undefined {
  try {
    return realpathSync.native(path);
  } catch {
    return undefined;
  }
}

function isDescendantOrSame(path: string): boolean {
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`));
}

function normalizeRaw(path: string): string {
  const resolved = resolve(path);
  return process.platform === 'win32' ? resolved.replaceAll('/', '\\').toLowerCase() : resolved;
}
