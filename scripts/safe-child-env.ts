/**
 * Environment passed to repository-controlled commands. CI and local shells
 * often contain credentials, preload hooks, proxy settings, or package-manager
 * configuration that must not become ambient input to untrusted code.
 */
const SAFE_KEYS = [
  'CI',
  'ComSpec',
  'COMSPEC',
  'GITHUB_ACTIONS',
  'GITHUB_EVENT_NAME',
  'GITHUB_REF',
  'GITHUB_REF_NAME',
  'GITHUB_SHA',
  'LANG',
  'LC_ALL',
  'Path',
  'PATH',
  'PATHEXT',
  'RUNNER_OS',
  'SystemRoot',
  'TEMP',
  'TMP',
  'TMPDIR',
  'TZ',
] as const;

export function safeChildEnvironment(
  overrides: Readonly<Record<string, string>> = {},
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of SAFE_KEYS) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  const pathValue = environment.PATH ?? environment.Path;
  if (pathValue !== undefined) {
    environment.PATH = pathValue;
    environment.Path = pathValue;
  }
  environment.CI = 'true';
  environment.TZ = 'UTC';
  for (const [key, value] of Object.entries(overrides)) {
    if (!/^EOM_[A-Z0-9_]+$/u.test(key) && key !== 'SOURCE_DATE_EPOCH') {
      throw new Error(`Unsafe child environment override is not permitted: ${key}`);
    }
    environment[key] = value;
  }
  return environment;
}
