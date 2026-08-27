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
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
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
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/gu, '')
    .replace(/\.$/u, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }
  return isIpLiteral(host) && isBlockedIp(host);
}

/**
 * Return whether an IPv4 or IPv6 literal is private, link-local, multicast,
 * documentation-only, or otherwise unsuitable as a public publication target.
 * This is deliberately dependency-free so the same policy can run in Node and
 * in the browser linter.
 */
export function isBlockedIp(value: string): boolean {
  const normalized = value.replace(/^\[|\]$/gu, '').toLowerCase();
  if (normalized.includes(':')) return isBlockedIpv6(normalized);
  const parts = normalized.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }
  const [a, b, c] = parts;
  if (a === undefined || b === undefined || c === undefined) return true;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 2 || b === 168)) ||
    (a === 198 && b >= 18 && b <= 19) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isIpLiteral(value: string): boolean {
  return /^\d+(?:\.\d+){3}$/u.test(value) || value.includes(':');
}

function isBlockedIpv6(value: string): boolean {
  const parsed = parseIpv6(value);
  if (parsed === undefined || parsed === 0n || parsed === 1n) return true;
  if (hasIpv6Prefix(parsed, '00000000000000000000ffff', 96)) {
    const mapped = Number(parsed & 0xffffffffn);
    return isBlockedIp(
      `${mapped >>> 24}.${(mapped >>> 16) & 0xff}.${(mapped >>> 8) & 0xff}.${mapped & 0xff}`,
    );
  }
  return (
    hasIpv6Prefix(parsed, 'fc', 7) ||
    hasIpv6Prefix(parsed, 'fe80', 10) ||
    hasIpv6Prefix(parsed, 'ff', 8) ||
    hasIpv6Prefix(parsed, '20010db8', 32) ||
    hasIpv6Prefix(parsed, '20010000', 32) ||
    hasIpv6Prefix(parsed, '200100020000', 48) ||
    hasIpv6Prefix(parsed, '2001001', 28) ||
    hasIpv6Prefix(parsed, '0100000000000000', 64) ||
    hasIpv6Prefix(parsed, '0064ff9b0000000000000000', 96) ||
    hasIpv6Prefix(parsed, '3fff0', 20) ||
    hasIpv6Prefix(parsed, '000000000000000000000000', 96)
  );
}

function parseIpv6(value: string): bigint | undefined {
  if (!value || value.includes('%')) return undefined;
  const separator = value.indexOf('::');
  if (separator !== value.lastIndexOf('::')) return undefined;
  const leftText = separator < 0 ? value : value.slice(0, separator);
  const rightText = separator < 0 ? '' : value.slice(separator + 2);
  const left = ipv6Groups(leftText);
  const right = ipv6Groups(rightText);
  if (left === undefined || right === undefined) return undefined;
  const count = left.length + right.length;
  if (separator < 0 ? count !== 8 : count >= 8) return undefined;
  const groups =
    separator < 0
      ? [...left]
      : [...left, ...Array.from({ length: 8 - count }, () => '0'), ...right];
  return groups.reduce((result, group) => (result << 16n) | BigInt(`0x${group}`), 0n);
}

function ipv6Groups(value: string): string[] | undefined {
  if (!value) return [];
  const parts = value.split(':');
  const result: string[] = [];
  for (const [index, part] of parts.entries()) {
    if (part.includes('.')) {
      if (index !== parts.length - 1) return undefined;
      const octets = part.split('.').map(Number);
      if (
        octets.length !== 4 ||
        octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
      ) {
        return undefined;
      }
      result.push(((octets[0] ?? 0) * 256 + (octets[1] ?? 0)).toString(16));
      result.push(((octets[2] ?? 0) * 256 + (octets[3] ?? 0)).toString(16));
    } else {
      if (!/^[0-9a-f]{1,4}$/u.test(part)) return undefined;
      result.push(part);
    }
  }
  return result;
}

function hasIpv6Prefix(value: bigint, prefixHex: string, bits: number): boolean {
  const prefixWidth = BigInt(prefixHex.length * 4);
  const prefix = BigInt(`0x${prefixHex}`) >> (prefixWidth - BigInt(bits));
  return value >> BigInt(128 - bits) === prefix;
}
