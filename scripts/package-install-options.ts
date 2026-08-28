/**
 * Arguments for the clean package-consumer installation. The tarballs are
 * local, while transitive registry metadata may be absent from a fresh CI
 * cache, so pnpm should prefer its store without being forced offline.
 */
export const CLEAN_PACKAGE_INSTALL_ARGS = [
  'install',
  '--prefer-offline',
  '--ignore-scripts',
  '--no-frozen-lockfile',
] as const;
