export function isAbsoluteUri(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || /\s/u.test(value)) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol.length > 1;
  } catch {
    return false;
  }
}

export function isHttpsUri(value: unknown): value is string {
  if (!isAbsoluteUri(value)) {
    return false;
  }
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function originOf(value: string): string | undefined {
  try {
    const parsed = new URL(value);
    return parsed.origin === 'null' ? undefined : parsed.origin;
  } catch {
    return undefined;
  }
}

export function normalizeOrigin(value: string): string | undefined {
  const origin = originOf(value);
  return origin?.toLowerCase();
}

export function isSameOrigin(left: string, right: string): boolean {
  return normalizeOrigin(left) === normalizeOrigin(right);
}

export function isPathWithin(
  uri: string,
  origin: string,
  prefixes: readonly string[] = ['/'],
): boolean {
  try {
    const parsed = new URL(uri);
    if (normalizeOrigin(parsed.href) !== normalizeOrigin(origin)) {
      return false;
    }
    return prefixes.some((prefix) => {
      const normalized = prefix.endsWith('/') ? prefix : `${prefix}/`;
      return parsed.pathname === prefix || parsed.pathname.startsWith(normalized);
    });
  } catch {
    return false;
  }
}

export function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/u, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }
  if (/^127(?:\.\d{1,3}){3}$/u.test(host) || /^10(?:\.\d{1,3}){3}$/u.test(host)) {
    return true;
  }
  const private172 = host.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/u);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) {
    return true;
  }
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/u.test(host) || host === '::1' || host === '[::1]') {
    return true;
  }
  return false;
}
