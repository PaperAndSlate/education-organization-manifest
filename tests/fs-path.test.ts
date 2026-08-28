import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeFsPath } from '@paperandslate/eom-core/fs-path';

describe('filesystem safety path normalization', () => {
  it('treats the operating system temporary-directory alias as canonical', () => {
    const temporaryAlias = resolve(tmpdir());
    const temporaryCanonical = realpathSync.native(temporaryAlias);
    const suffix = 'eom-path-regression';

    expect(normalizeFsPath(temporaryAlias)).toBe(normalizeFsPath(temporaryCanonical));
    expect(normalizeFsPath(join(temporaryAlias, suffix))).toBe(
      normalizeFsPath(join(temporaryCanonical, suffix)),
    );
  });

  it('does not collapse a path outside the trusted temporary alias', () => {
    const temporaryAlias = resolve(tmpdir());
    const temporaryCanonical = realpathSync.native(temporaryAlias);
    const outside = resolve(temporaryAlias, '..', 'eom-path-outside');

    expect(relative(temporaryAlias, outside)).toMatch(/\.\./u);
    if (normalizeFsPath(temporaryAlias) !== normalizeFsPath(temporaryCanonical)) {
      expect(normalizeFsPath(outside)).not.toBe(
        normalizeFsPath(join(temporaryCanonical, 'eom-path-outside')),
      );
    }
  });
});
