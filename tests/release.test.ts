import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseStrictJson } from '@paperandslate/eom-core';

const root = resolve(process.cwd());

describe('EOM release evidence', () => {
  it('contains a self-consistent candidate manifest and checksums', () => {
    const releaseRoot = join(root, 'release');
    const manifest = parseStrictJson(readFileSync(join(releaseRoot, 'manifest.json'), 'utf8'));
    expect(isRecord(manifest)).toBe(true);
    if (!isRecord(manifest) || !Array.isArray(manifest.artifacts)) return;
    expect(manifest.release).toBe('1.0.0-rc.1');
    expect(manifest.channel).toBe('release-candidate');
    expect(manifest.protocolStatus).toBe('working-draft');
    expect(isRecord(manifest.externalGates)).toBe(true);
    if (isRecord(manifest.externalGates)) {
      expect(manifest.externalGates.ianaRegistration).toBe('blocked-external');
      expect(manifest.externalGates.independentPublisherConsumerPilot).toBe('blocked-external');
    }
    for (const artifact of manifest.artifacts) {
      expect(isRecord(artifact)).toBe(true);
      if (!isRecord(artifact) || typeof artifact.path !== 'string') continue;
      const path = join(releaseRoot, artifact.path);
      expect(existsSync(path), artifact.path).toBe(true);
      const bytes = readFileSync(path);
      expect(artifact.bytes).toBe(bytes.length);
      expect(artifact.sha256).toBe(sha256(bytes));
    }
  });

  it('keeps provenance and public-status language honest', () => {
    const releaseRoot = join(root, 'release');
    const provenance = parseStrictJson(
      readFileSync(join(releaseRoot, 'build-provenance.json'), 'utf8'),
    );
    expect(isRecord(provenance)).toBe(true);
    if (isRecord(provenance)) {
      expect(provenance.provenanceStatus).toBe('local metadata; not a signed external attestation');
    }
    const status = readFileSync(join(root, 'docs/project-status.md'), 'utf8');
    expect(status).toMatch(/not claimed as IANA-registered/iu);
    expect(status).toMatch(/external.*blocker/iu);
    const registration = readFileSync(join(releaseRoot, 'registration/status.json'), 'utf8');
    expect(registration).toMatch(/"status":\s*"blocked-external"/u);
    expect(registration).toMatch(/"acceptance":\s*"not-claimed"/u);
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
