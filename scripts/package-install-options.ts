/** Arguments used to resolve the temporary consumer lockfile. */
export const CLEAN_PACKAGE_LOCK_ARGS = [
  'install',
  '--lockfile-only',
  '--prefer-offline',
  '--ignore-scripts',
] as const;

/**
 * Arguments for the clean package-consumer installation. The lockfile is
 * generated in the isolated consumer first, so the actual install is frozen.
 * Tarballs are local, while transitive registry metadata may be absent from a
 * fresh CI cache, so pnpm should prefer its store without being forced offline.
 */
export const CLEAN_PACKAGE_INSTALL_ARGS = [
  'install',
  '--prefer-offline',
  '--frozen-lockfile',
  '--ignore-scripts',
] as const;
