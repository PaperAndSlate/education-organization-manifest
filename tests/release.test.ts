import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseStrictJson } from '@paperandslate/eom-core';
import {
  CLEAN_PACKAGE_INSTALL_ARGS,
  CLEAN_PACKAGE_LOCK_ARGS,
} from '../scripts/package-install-options.js';

const root = resolve(process.cwd());

describe('EOM release evidence', () => {
  it('keeps clean package smoke installs usable on fresh hosted caches', () => {
    expect(CLEAN_PACKAGE_LOCK_ARGS).toEqual([
      'install',
      '--lockfile-only',
      '--prefer-offline',
      '--ignore-scripts',
    ]);
    expect(CLEAN_PACKAGE_INSTALL_ARGS).toEqual([
      'install',
      '--prefer-offline',
      '--frozen-lockfile',
      '--ignore-scripts',
    ]);
    expect(CLEAN_PACKAGE_INSTALL_ARGS).not.toContain('--offline');
  });

  it('uses cross-platform local tarball overrides for the package smoke consumer', () => {
    const packageCheck = readFileSync(join(root, 'scripts', 'check-packages.ts'), 'utf8');
    expect(packageCheck).toContain("join(smokeRoot, 'pnpm-workspace.yaml')");
    expect(packageCheck).toContain('file:./');
    expect(packageCheck).toContain('safeChildEnvironment()');
    expect(packageCheck).not.toMatch(/pnpm:\s*\{\s*overrides/u);
  });

  it('does not pass ambient environment variables into release package commands', () => {
    const releaseTooling = readFileSync(
      join(root, 'scripts', 'generate-release-artifacts.ts'),
      'utf8',
    );
    expect(releaseTooling).toContain("import { safeChildEnvironment } from './safe-child-env.js';");
    expect(releaseTooling).toContain('env: safeChildEnvironment()');
  });

  it('contains a self-consistent candidate manifest and checksums', () => {
    const releaseRoot = join(root, 'release');
    const manifest = parseStrictJson(readFileSync(join(releaseRoot, 'manifest.json'), 'utf8'));
    expect(isRecord(manifest)).toBe(true);
    if (!isRecord(manifest) || !Array.isArray(manifest.artifacts)) return;
    expect(manifest.release).toBe('1.0.0-rc.3');
    expect(manifest.channel).toBe('release-candidate');
    expect(manifest.protocolStatus).toBe('working-draft');
    expect(isRecord(manifest.externalGates)).toBe(true);
    if (isRecord(manifest.externalGates)) {
      expect(manifest.externalGates.ianaRegistration).toBe('blocked-external');
      expect(manifest.externalGates.independentPublisherConsumerPilot).toBe('blocked-external');
    }
    expect(manifest.sourceCommit).toMatch(/^[a-f0-9]{40}$/u);
    expect(manifest.sourceTree).toMatch(/^[a-f0-9]{40}$/u);
    expect(isRecord(manifest.historicalSuperseded)).toBe(true);
    if (isRecord(manifest.historicalSuperseded)) {
      expect(manifest.historicalSuperseded.release).toBe('1.0.0-rc.1');
      expect(manifest.historicalSuperseded.status).toBe('preserved-immutable-superseded');
    }
    expect(Array.isArray(manifest.historicalSupersededReleases)).toBe(true);
    if (Array.isArray(manifest.historicalSupersededReleases)) {
      expect(manifest.historicalSupersededReleases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            release: '1.0.0-rc.2',
            status: 'preserved-immutable-superseded',
          }),
        ]),
      );
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
    for (const required of [
      'eom-specification-1.0.0-rc.3.tar.gz',
      'eom-schemas-1.0.0-rc.3.tar.gz',
      'eom-vocabularies-1.0.0-rc.3.tar.gz',
      'eom-conformance-1.0.0-rc.3.tar.gz',
      'eom-documentation-1.0.0-rc.3.tar.gz',
      'package-pack-manifest.json',
    ]) {
      expect(
        manifest.artifacts.some((artifact) => isRecord(artifact) && artifact.path === required),
      ).toBe(true);
    }
    expect(existsSync(join(releaseRoot, 'v1.0.0-rc.3', 'reports', 'local'))).toBe(false);
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
