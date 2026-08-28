import { gunzipSync, gzipSync } from 'node:zlib';

export interface TarEntry {
  readonly path: string;
  readonly bytes: Buffer;
}

export const MAX_TAR_ENTRIES = 100_000;
export const MAX_TAR_BYTES = 64 * 1024 * 1024;
export const MAX_TAR_GZIP_BYTES = 64 * 1024 * 1024;

/**
 * Read the small regular-file tar profile used by EOM release artifacts.
 * Directories, links, device nodes, unsafe paths, duplicate names, malformed
 * checksums, truncated payloads, and trailing data are rejected.
 */
export function readTarGz(bytes: Buffer): TarEntry[] {
  if (bytes.length > MAX_TAR_GZIP_BYTES) throw new Error('tar.gz input exceeds its byte limit.');
  let tar: Buffer;
  try {
    tar = gunzipSync(bytes, { maxOutputLength: MAX_TAR_BYTES + 1024 });
  } catch (error) {
    throw new Error(
      `tar.gz decompression failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (tar.length > MAX_TAR_BYTES) throw new Error('tar payload exceeds its byte limit.');

  const entries: TarEntry[] = [];
  const names = new Set<string>();
  let offset = 0;
  let totalBytes = 0;
  let terminated = false;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      if (
        offset + 1024 !== tar.length ||
        !tar.subarray(offset + 512, offset + 1024).every((byte) => byte === 0)
      )
        throw new Error('tar archive has an invalid end-of-archive marker.');
      terminated = true;
      break;
    }
    verifyChecksum(header);
    const name = readTextField(header, 0, 100, 'name');
    const prefix = readTextField(header, 345, 155, 'prefix');
    const path = prefix ? `${prefix}/${name}` : name;
    assertSafeTarPath(path);
    if (names.has(path)) throw new Error(`tar archive contains a duplicate path: ${path}`);
    names.add(path);
    if (entries.length >= MAX_TAR_ENTRIES)
      throw new Error('tar archive contains too many entries.');
    const size = readOctalField(header, 124, 12, 'size');
    const type = header[156];
    if (type !== 0 && type !== 48)
      throw new Error(`tar archive contains unsupported entry type for ${path}.`);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    const paddedEnd = dataStart + Math.ceil(size / 512) * 512;
    if (dataEnd < dataStart || paddedEnd > tar.length)
      throw new Error(`tar archive entry is truncated: ${path}`);
    totalBytes += size;
    if (totalBytes > MAX_TAR_BYTES) throw new Error('tar archive payload exceeds its byte limit.');
    entries.push({ path, bytes: Buffer.from(tar.subarray(dataStart, dataEnd)) });
    offset = paddedEnd;
  }
  if (!terminated || offset + 1024 !== tar.length)
    throw new Error('tar archive is missing its end marker.');
  return entries.sort((left, right) => compareStrings(left.path, right.path));
}

/** Create a deterministic regular-file tar.gz archive for the EOM release profile. */
export function createTarGz(entries: readonly TarEntry[]): Buffer {
  if (entries.length > MAX_TAR_ENTRIES) throw new Error('tar archive contains too many entries.');
  const names = new Set<string>();
  let totalBytes = 0;
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    assertSafeTarPath(entry.path);
    if (names.has(entry.path))
      throw new Error(`tar archive contains a duplicate path: ${entry.path}`);
    names.add(entry.path);
    if (!Buffer.isBuffer(entry.bytes))
      throw new Error(`tar archive entry is not a byte buffer: ${entry.path}`);
    totalBytes += entry.bytes.length;
    if (totalBytes > MAX_TAR_BYTES) throw new Error('tar archive payload exceeds its byte limit.');
    blocks.push(tarHeader(entry.path, entry.bytes.length), entry.bytes);
    const padding = (512 - (entry.bytes.length % 512)) % 512;
    if (padding > 0) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(1024));
  const compressed = gzipSync(Buffer.concat(blocks), { level: 9 });
  if (compressed.length > MAX_TAR_GZIP_BYTES)
    throw new Error('tar.gz output exceeds its byte limit.');
  return compressed;
}

function tarHeader(path: string, size: number): Buffer {
  const header = Buffer.alloc(512, 0);
  const slash = path.lastIndexOf('/');
  const name = path.length <= 100 ? path : path.slice(slash + 1);
  const prefix = path.length <= 100 ? '' : path.slice(0, slash);
  if (Buffer.byteLength(name, 'utf8') > 100 || Buffer.byteLength(prefix, 'utf8') > 155)
    throw new Error(`Archive path is too long: ${path}`);
  writeTextField(header, 0, 100, name);
  writeTextField(header, 100, 8, '0000644\0');
  writeTextField(header, 108, 8, '0000000\0');
  writeTextField(header, 116, 8, '0000000\0');
  writeTextField(header, 124, 12, `${size.toString(8).padStart(11, '0')}\0`);
  writeTextField(header, 136, 12, '00000000000\0');
  writeTextField(header, 148, 8, '        ');
  writeTextField(header, 156, 1, '0');
  writeTextField(header, 257, 6, 'ustar\0');
  writeTextField(header, 263, 2, '00');
  writeTextField(header, 265, 32, 'paperandslate');
  writeTextField(header, 297, 32, 'paperandslate');
  writeTextField(header, 329, 8, '0000000\0');
  writeTextField(header, 337, 8, '0000000\0');
  writeTextField(header, 345, 155, prefix);
  const checksum = [...header].reduce((sum, byte) => sum + byte, 0);
  writeTextField(header, 148, 8, `${checksum.toString(8).padStart(6, '0')}\0 `);
  return header;
}

function verifyChecksum(header: Buffer): void {
  const expected = readOctalField(header, 148, 8, 'checksum');
  let actual = 0;
  for (let index = 0; index < header.length; index += 1) {
    actual += index >= 148 && index < 156 ? 0x20 : (header[index] ?? 0);
  }
  if (actual !== expected) throw new Error('tar archive header checksum is invalid.');
}

function readTextField(buffer: Buffer, offset: number, length: number, label: string): string {
  const value = buffer.subarray(offset, offset + length);
  const end = value.findIndex((byte) => byte === 0);
  const content = end >= 0 ? value.subarray(0, end) : value;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch (error) {
    throw new Error(
      `tar archive ${label} is not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function readOctalField(buffer: Buffer, offset: number, length: number, label: string): number {
  const value = readTextField(buffer, offset, length, label).trim();
  if (!/^[0-7]+$/u.test(value)) throw new Error(`tar archive ${label} is not valid octal.`);
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new Error(`tar archive ${label} is out of range.`);
  return parsed;
}

function assertSafeTarPath(path: string): void {
  if (
    path.length === 0 ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.startsWith('/') ||
    /^[A-Za-z]:/u.test(path) ||
    path.split('/').some((part) => part.length === 0 || part === '.' || part === '..')
  ) {
    throw new Error(`tar archive path is unsafe: ${path}`);
  }
}

function writeTextField(buffer: Buffer, offset: number, length: number, value: string): void {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length > length) throw new Error('tar header field is too long.');
  buffer.fill(0, offset, offset + length);
  bytes.copy(buffer, offset);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
