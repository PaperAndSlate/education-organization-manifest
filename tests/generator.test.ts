import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { isJsonObject, parseStrictJson } from '@paperandslate/eom-core';
import {
  buildPublication,
  parseAuthoringText,
  type BuildReport,
} from '@paperandslate/eom-generator';
import { validateDocument } from '@paperandslate/eom-validator';

describe('EOM deterministic authoring generator', () => {
  it('rejects duplicate YAML keys and aliases before normalization', () => {
    expect(() => parseAuthoringText('name: one\nname: two\n', 'duplicate.yaml')).toThrow();
    expect(() => parseAuthoringText('name: &shared one\ncopy: *shared\n', 'alias.yaml')).toThrow(
      /alias/iu,
    );
  });

  it('builds a small YAML project into valid canonical resources and reports', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-generator-'));
    try {
      const source = join(root, 'source');
      const output = join(root, 'generated', 'public');
      await writeFile(
        join(root, 'eom.config.yaml'),
        [
          'project:',
          '  name: Example School EOM',
          '  protocolVersion: "1.0"',
          '  defaultLanguage: en-US',
          'publisher:',
          '  origin: https://example-school.example',
          '  manifestPath: /.well-known/educational-organization-manifest',
          'source:',
          '  root: source',
          '  modules:',
          '    organization:',
          '      - organization.yaml',
          '    courses:',
          '      - courses/*.yaml',
          'output:',
          '  root: generated/public',
          'validation:',
          '  privacyLint: true',
          'publication:',
          '  modified: 2027-01-01T00:00:00Z',
          '  expires: 2028-01-01T00:00:00Z',
          'signing:',
          '  enabled: false',
          '',
        ].join('\n'),
      );
      await writeFile(join(root, 'source-marker.txt'), 'not part of the configured source root\n');
      await mkdir(join(source, 'courses'), { recursive: true });
      await writeFile(
        join(source, 'organization.yaml'),
        [
          'id: https://example-school.example/id/school',
          'type: secondary-school',
          'organizationType: secondary-school',
          'name: Example School',
          'canonical: https://example-school.example/eom/organization.json',
          'website: https://example-school.example/',
          'status: active',
          '',
        ].join('\n'),
      );
      await writeFile(
        join(source, 'courses', 'intro.yaml'),
        [
          'id: https://example-school.example/id/course/intro',
          'type: course',
          'name: Introduction to Example Studies',
          'provider: https://example-school.example/id/school',
          'code: EX-101',
          'educationLevels:',
          '  - grade-9',
          '',
        ].join('\n'),
      );

      const first = await buildPublication({
        configFile: join(root, 'eom.config.yaml'),
        outputRoot: output,
        now: new Date('2027-01-02T00:00:00Z'),
      });
      expect(first.valid, JSON.stringify(first.findings)).toBe(true);
      expect(first.written).toBe(true);
      expect(first.resources.some((resource) => resource.type === 'course-catalog')).toBe(true);

      const manifest = parseStrictJson(
        await readFile(join(output, '.well-known', 'educational-organization-manifest'), 'utf8'),
      );
      const courseCatalog = parseStrictJson(
        await readFile(join(output, 'eom', 'courses.json'), 'utf8'),
      );
      expect(validateDocument(manifest).valid).toBe(true);
      expect(validateDocument(courseCatalog).valid).toBe(true);
      expect(await readFile(join(root, 'generated', 'build', 'source-map.json'), 'utf8')).toContain(
        'courses/intro.yaml',
      );

      const secondOutput = join(root, 'generated-second', 'public');
      const second = await buildPublication({
        configFile: join(root, 'eom.config.yaml'),
        outputRoot: secondOutput,
        now: new Date('2027-01-02T00:00:00Z'),
      });
      expect(second.valid).toBe(true);
      expect(first.fingerprint).toBe(second.fingerprint);
      expect(await readFile(join(output, 'eom', 'courses.json'), 'utf8')).toBe(
        await readFile(join(secondOutput, 'eom', 'courses.json'), 'utf8'),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns a non-publishing report for duplicate stable ids', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-generator-invalid-'));
    try {
      await writeFile(
        join(root, 'eom.config.yaml'),
        [
          'project: { name: Invalid, protocolVersion: "1.0", defaultLanguage: en-US }',
          'publisher: { origin: https://invalid.example, manifestPath: /.well-known/educational-organization-manifest }',
          'source:',
          '  root: source',
          '  modules:',
          '    organization: [organization.yaml]',
          '    courses: [one.yaml, two.yaml]',
          'output: { root: generated/public }',
          'signing: { enabled: false }',
          '',
        ].join('\n'),
      );
      await mkdir(join(root, 'source'), { recursive: true });
      await writeFile(
        join(root, 'source', 'organization.yaml'),
        'id: https://invalid.example/id/school\ntype: school\nname: Invalid\n',
      );
      const duplicate =
        'id: https://invalid.example/id/course/same\ntype: course\nname: Same\nprovider: https://invalid.example/id/school\n';
      await writeFile(join(root, 'source', 'one.yaml'), duplicate);
      await writeFile(join(root, 'source', 'two.yaml'), duplicate);
      const report: BuildReport = await buildPublication({
        configFile: join(root, 'eom.config.yaml'),
        outputRoot: join(root, 'generated', 'public'),
      });
      expect(report.valid).toBe(false);
      expect(report.written).toBe(false);
      expect(report.findings.some((item) => item.code === 'EOM_GENERATOR_DUPLICATE_ID')).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects project roots, source descendants, and unmarked replacement targets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-generator-safety-'));
    try {
      await writeFile(
        join(root, 'eom.config.yaml'),
        [
          'project: { name: Safety, protocolVersion: "1.0", defaultLanguage: en-US }',
          'publisher: { origin: https://safety.example, manifestPath: /.well-known/educational-organization-manifest }',
          'source: { root: source, modules: { organization: [organization.yaml] } }',
          'output: { root: generated/public }',
          'signing: { enabled: false }',
          '',
        ].join('\n'),
      );
      await mkdir(join(root, 'source'), { recursive: true });
      await writeFile(
        join(root, 'source', 'organization.yaml'),
        'id: https://safety.example/id/school\ntype: school\nname: Safety\n',
      );
      const projectRootReport = await buildPublication({
        configFile: join(root, 'eom.config.yaml'),
        outputRoot: root,
      });
      expect(projectRootReport.findings.some((item) => item.code === 'EOM_GENERATOR_OUTPUT_UNSAFE')).toBe(
        true,
      );

      const unmarked = join(root, 'generated', 'public');
      await mkdir(unmarked, { recursive: true });
      await writeFile(join(unmarked, 'unrelated.txt'), 'must survive');
      const unmarkedReport = await buildPublication({
        configFile: join(root, 'eom.config.yaml'),
        outputRoot: unmarked,
      });
      expect(unmarkedReport.findings.some((item) => item.code === 'EOM_GENERATOR_OUTPUT_UNSAFE')).toBe(
        true,
      );
      expect(await readFile(join(unmarked, 'unrelated.txt'), 'utf8')).toBe('must survive');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('builds the complete fictional Ecme course catalog without proposed sources', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-ecme-generator-'));
    try {
      const report = await buildPublication({
        configFile: join(process.cwd(), 'examples/ecme-high/source/eom.config.yaml'),
        outputRoot: join(root, 'public'),
        allowExternalOutput: true,
        now: new Date('2027-01-01T00:00:00Z'),
      });
      expect(report.valid, JSON.stringify(report.findings)).toBe(true);
      expect(
        report.resources.find((resource) => resource.type === 'course-catalog')?.itemCount,
      ).toBe(57);
      const courses = parseStrictJson(
        await readFile(join(root, 'public', 'eom', 'courses.json'), 'utf8'),
      );
      expect(courses).toMatchObject({
        type: 'course-catalog',
        releaseStatus: 'active',
        catalogVersion: { status: 'active' },
      });
      if (!isJsonObject(courses) || !Array.isArray(courses.items)) return;
      const culinary = courses.items.find(
        (item) => isJsonObject(item) && item.code === 'CUL-202',
      ) as Record<string, unknown> | undefined;
      expect(culinary?.prerequisites).toBeTruthy();
      expect(culinary?.fees).toBeTruthy();
      expect(courses.items.some((item) => isJsonObject(item) && item.code === 'CSE-301')).toBe(
        false,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
