import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { generateKeyPairSync } from 'node:crypto';
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
import { verifyDetached } from '@paperandslate/eom-signatures';

describe('EOM deterministic authoring generator', () => {
  it('rejects duplicate YAML keys and aliases before normalization', () => {
    expect(() => parseAuthoringText('name: one\nname: two\n', 'duplicate.yaml')).toThrow();
    expect(() => parseAuthoringText('name: &shared one\ncopy: *shared\n', 'alias.yaml')).toThrow(
      /alias/iu,
    );
  });

  it('rejects source-tree symlinks instead of silently omitting configured inputs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-generator-source-symlink-'));
    try {
      const source = join(root, 'source');
      await mkdir(source, { recursive: true });
      await writeFile(
        join(root, 'eom.config.yaml'),
        [
          'project: { name: Symlink Source, protocolVersion: "1.0", defaultLanguage: en-US }',
          'publisher: { origin: https://symlink-source.example, manifestPath: /.well-known/educational-organization-manifest }',
          'source: { root: source, modules: { organization: [organization.yaml] } }',
          'output: { root: generated/public }',
          '',
        ].join('\n'),
      );
      const outside = join(root, 'outside-organization.yaml');
      await writeFile(
        outside,
        'id: https://symlink-source.example/id/school\ntype: school\nname: Symlink Source\n',
      );
      try {
        await symlink(outside, join(source, 'organization.yaml'), 'file');
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          (error.code === 'EACCES' || error.code === 'EPERM' || error.code === 'EINVAL')
        ) {
          return;
        }
        throw error;
      }
      const report = await buildPublication({
        configFile: join(root, 'eom.config.yaml'),
        outputRoot: join(root, 'generated', 'public'),
      });
      expect(report.valid).toBe(false);
      expect(report.findings).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'EOM_GENERATOR_INPUT_SYMLINK' })]),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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
          '    departments:',
          '      - departments.yaml',
          '    courses:',
          '      - courses/*.yaml',
          '    programs:',
          '      - programs.yaml',
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
      await writeFile(join(source, 'departments.yaml'), 'items: []\n');
      await writeFile(join(source, 'programs.yaml'), 'items: []\n');

      const first = await buildPublication({
        configFile: join(root, 'eom.config.yaml'),
        outputRoot: output,
        now: new Date('2027-01-02T00:00:00Z'),
      });
      expect(first.valid, JSON.stringify(first.findings)).toBe(true);
      expect(first.written).toBe(true);
      expect(first.resources.some((resource) => resource.type === 'course-catalog')).toBe(true);
      expect(first.resources.every((resource) => /^[a-f0-9]{64}$/u.test(resource.sha256))).toBe(
        true,
      );
      expect(first.privacy).toMatchObject({ status: 'clear', acknowledgements: [] });
      expect(first.conflicts).toEqual([]);

      const changedOutput = join(root, 'generated-changed', 'public');
      const changed = await buildPublication({
        configFile: join(root, 'eom.config.yaml'),
        outputRoot: changedOutput,
        mode: 'changed-files',
        changedFiles: ['source/courses/intro.yaml'],
        now: new Date('2027-01-02T00:00:00Z'),
      });
      expect(changed.valid, JSON.stringify(changed.findings)).toBe(true);
      expect(changed.written).toBe(true);
      expect(changed.partial).toMatchObject({
        mode: 'changed-files',
        changedFiles: ['source/courses/intro.yaml'],
        selectedModules: ['courses', 'departments', 'organization', 'programs'],
        dependencyClosure: ['courses', 'departments', 'organization', 'programs'],
        completePublication: false,
      });

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

      if (process.platform !== 'win32') {
        const caseSensitiveChanged = await buildPublication({
          configFile: join(root, 'eom.config.yaml'),
          outputRoot: join(root, 'generated-case-sensitive', 'public'),
          mode: 'changed-files',
          changedFiles: ['source/COURSES/intro.yaml'],
          now: new Date('2027-01-02T00:00:00Z'),
        });
        expect(caseSensitiveChanged.valid).toBe(false);
        expect(caseSensitiveChanged.findings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: 'EOM_GENERATOR_CHANGED_FILE_NOT_FOUND' }),
          ]),
        );
      }

      const omittedPartialOutput = await buildPublication({
        configFile: join(root, 'eom.config.yaml'),
        module: 'courses',
        now: new Date('2027-01-02T00:00:00Z'),
      });
      expect(omittedPartialOutput.valid).toBe(false);
      expect(
        omittedPartialOutput.findings.some((item) => item.code === 'EOM_GENERATOR_OUTPUT_UNSAFE'),
      ).toBe(true);

      const dryRunOmittedPartial = await buildPublication({
        configFile: join(root, 'eom.config.yaml'),
        module: 'courses',
        dryRun: true,
        now: new Date('2027-01-02T00:00:00Z'),
      });
      expect(dryRunOmittedPartial.valid).toBe(false);
      expect(
        dryRunOmittedPartial.findings.some((item) => item.code === 'EOM_GENERATOR_OUTPUT_UNSAFE'),
      ).toBe(true);

      const dryRunFullOutput = await buildPublication({
        configFile: join(root, 'eom.config.yaml'),
        outputRoot: output,
        module: 'courses',
        dryRun: true,
        now: new Date('2027-01-02T00:00:00Z'),
      });
      expect(dryRunFullOutput.valid).toBe(false);
      expect(
        dryRunFullOutput.findings.some((item) => item.code === 'EOM_GENERATOR_OUTPUT_UNSAFE'),
      ).toBe(true);

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

      const checkedOutput = join(root, 'generated-checked', 'public');
      const checked = await buildPublication({
        configFile: join(root, 'eom.config.yaml'),
        outputRoot: checkedOutput,
        now: new Date('2027-01-02T00:00:00Z'),
        verifyDeterministic: true,
      });
      expect(checked.valid).toBe(true);
      expect(checked.deterministic).toEqual({ checked: true, valid: true, differences: [] });
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

  it('cannot disable prohibited privacy-field enforcement through generator config', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-generator-privacy-policy-'));
    try {
      await writeFile(
        join(root, 'eom.config.yaml'),
        [
          'project: { name: Privacy Policy, protocolVersion: "1.0", defaultLanguage: en-US }',
          'publisher: { origin: https://privacy-policy.example, manifestPath: /.well-known/educational-organization-manifest }',
          'source: { root: source, modules: { organization: [organization.yaml] } }',
          'output: { root: generated/public }',
          'validation: { privacyLint: false }',
          'signing: { enabled: false }',
          '',
        ].join('\n'),
      );
      await mkdir(join(root, 'source'), { recursive: true });
      await writeFile(
        join(root, 'source', 'organization.yaml'),
        [
          'id: https://privacy-policy.example/id/school',
          'type: school',
          'name: Privacy Policy',
          'extensions:',
          '  "https://privacy-policy.example/extensions/example":',
          '    student: must-not-publish',
          '',
        ].join('\n'),
      );
      const report = await buildPublication({
        configFile: join(root, 'eom.config.yaml'),
        outputRoot: join(root, 'generated', 'public'),
      });
      expect(report.valid).toBe(false);
      expect(report.written).toBe(false);
      expect(report.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'EOM_PRIVACY_PROHIBITED_FIELD', severity: 'error' }),
        ]),
      );
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
      expect(
        projectRootReport.findings.some((item) => item.code === 'EOM_GENERATOR_OUTPUT_UNSAFE'),
      ).toBe(true);

      const unmarked = join(root, 'generated', 'public');
      await mkdir(unmarked, { recursive: true });
      await writeFile(join(unmarked, 'unrelated.txt'), 'must survive');
      const unmarkedReport = await buildPublication({
        configFile: join(root, 'eom.config.yaml'),
        outputRoot: unmarked,
      });
      expect(
        unmarkedReport.findings.some((item) => item.code === 'EOM_GENERATOR_OUTPUT_UNSAFE'),
      ).toBe(true);
      expect(await readFile(join(unmarked, 'unrelated.txt'), 'utf8')).toBe('must survive');

      await writeFile(
        join(unmarked, '.eom-generated.json'),
        JSON.stringify({
          generator: 'other',
          specification: 'https://paperandslate.org/spec/eom/1.0',
        }),
      );
      const invalidMarkerReport = await buildPublication({
        configFile: join(root, 'eom.config.yaml'),
        outputRoot: unmarked,
      });
      expect(
        invalidMarkerReport.findings.some((item) => item.code === 'EOM_GENERATOR_OUTPUT_UNSAFE'),
      ).toBe(true);
      expect(await readFile(join(unmarked, 'unrelated.txt'), 'utf8')).toBe('must survive');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('requires and honors an organization selector for multi-organization sources', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-generator-organizations-'));
    try {
      await writeFile(
        join(root, 'eom.config.yaml'),
        [
          'project: { name: Network, protocolVersion: "1.0", defaultLanguage: en-US }',
          'publisher: { origin: https://network.example, manifestPath: /.well-known/educational-organization-manifest }',
          'source: { root: source, modules: { organization: [organizations.yaml] } }',
          'output: { root: generated/public }',
          'signing: { enabled: false }',
          '',
        ].join('\n'),
      );
      await mkdir(join(root, 'source'), { recursive: true });
      await writeFile(
        join(root, 'source', 'organizations.yaml'),
        [
          'items:',
          '  - id: https://network.example/id/school-a',
          '    type: school',
          '    name: School A',
          '  - id: https://network.example/id/school-b',
          '    type: school',
          '    name: School B',
          '',
        ].join('\n'),
      );
      const missing = await buildPublication({
        configFile: join(root, 'eom.config.yaml'),
        outputRoot: join(root, 'generated', 'missing', 'public'),
      });
      expect(missing.valid).toBe(false);
      expect(
        missing.findings.some((item) => item.code === 'EOM_GENERATOR_ORGANIZATION_REQUIRED'),
      ).toBe(true);

      const selected = await buildPublication({
        configFile: join(root, 'eom.config.yaml'),
        outputRoot: join(root, 'generated', 'selected', 'public'),
        organization: 'https://network.example/id/school-b',
      });
      expect(selected.valid, JSON.stringify(selected.findings)).toBe(true);
      const organization = parseStrictJson(
        await readFile(
          join(root, 'generated', 'selected', 'public', 'eom', 'organization.json'),
          'utf8',
        ),
      );
      expect(organization).toMatchObject({
        id: 'https://network.example/id/school-b',
        name: 'School B',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('filters organization builds across module items, references, contacts, and manifest entries', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-generator-organization-filter-'));
    try {
      const organizationA = 'https://network.example/id/school-a';
      const organizationB = 'https://network.example/id/school-b';
      await writeFile(
        join(root, 'eom.config.yaml'),
        [
          'project: { name: Network, protocolVersion: "1.0", defaultLanguage: en-US }',
          'publisher: { origin: https://network.example, manifestPath: /.well-known/educational-organization-manifest }',
          'source:',
          '  root: source',
          '  modules:',
          '    organization: [organizations.yaml]',
          '    contacts: [contacts.yaml]',
          '    departments: [departments.yaml]',
          '    courses: [courses.yaml]',
          '    jobs: [jobs.yaml]',
          'output: { root: generated/public }',
          'signing: { enabled: false }',
          '',
        ].join('\n'),
      );
      await mkdir(join(root, 'source'), { recursive: true });
      await writeFile(
        join(root, 'source', 'organizations.yaml'),
        [
          'items:',
          `  - id: ${organizationA}`,
          '    type: school',
          '    name: School A',
          `  - id: ${organizationB}`,
          '    type: school',
          '    name: School B',
          '',
        ].join('\n'),
      );
      await writeFile(
        join(root, 'source', 'contacts.yaml'),
        [
          'items:',
          '  - id: https://network.example/id/contact/a',
          '    role: Admissions A',
          `    organization: ${organizationA}`,
          '  - id: https://network.example/id/contact/b',
          '    role: Admissions B',
          `    organization: ${organizationB}`,
          '',
        ].join('\n'),
      );
      await writeFile(
        join(root, 'source', 'courses.yaml'),
        [
          'items:',
          '  - id: https://network.example/id/course/a',
          '    type: course',
          '    name: Course A',
          `    provider: ${organizationA}`,
          '  - id: https://network.example/id/course/b',
          '    type: course',
          '    name: Course B',
          `    provider: ${organizationB}`,
          '    dualCreditPartners:',
          `      - ${organizationA}`,
          `      - ${organizationB}`,
          '    subjects:',
          '      - https://paperandslate.org/vocabularies/eom/subjects/1.0/mathematics',
          '      - https://paperandslate.org/vocabularies/eom/subjects/1.0/science',
          '',
        ].join('\n'),
      );
      await writeFile(
        join(root, 'source', 'jobs.yaml'),
        [
          'items:',
          '  - id: https://network.example/id/job/a',
          '    type: job-posting',
          '    name: Job A',
          `    hiringOrganization: { id: ${organizationA} }`,
          '    applicationUrl: https://network.example/jobs/a/apply',
          '    postedAt: 2026-08-01T00:00:00Z',
          '  - id: https://network.example/id/job/b',
          '    type: job-posting',
          '    name: Job B',
          `    hiringOrganization: { id: ${organizationB} }`,
          '    applicationUrl: https://network.example/jobs/b/apply',
          '    postedAt: 2026-08-01T00:00:00Z',
          '',
        ].join('\n'),
      );
      await writeFile(
        join(root, 'source', 'departments.yaml'),
        [
          'items:',
          '  - id: https://network.example/id/department/a',
          '    name: Department A',
          `    parentOrganization: ${organizationA}`,
          '  - id: https://network.example/id/department/b',
          '    name: Department B',
          `    parentOrganization: ${organizationB}`,
          '',
        ].join('\n'),
      );
      const report = await buildPublication({
        configFile: join(root, 'eom.config.yaml'),
        outputRoot: join(root, 'generated', 'selected', 'public'),
        mode: 'organization',
        organization: organizationB,
      });
      expect(report.valid, JSON.stringify(report.findings)).toBe(true);
      const selectedOutput = join(root, 'generated', 'selected', 'public', 'eom');
      const organization = parseStrictJson(
        await readFile(join(selectedOutput, 'organization.json'), 'utf8'),
      );
      const contacts = parseStrictJson(
        await readFile(join(selectedOutput, 'contacts.json'), 'utf8'),
      );
      const courses = parseStrictJson(await readFile(join(selectedOutput, 'courses.json'), 'utf8'));
      const jobs = parseStrictJson(await readFile(join(selectedOutput, 'jobs.json'), 'utf8'));
      const departments = parseStrictJson(
        await readFile(join(selectedOutput, 'departments.json'), 'utf8'),
      );
      const filteredCourses = parseStrictJson(
        await readFile(join(selectedOutput, 'courses.json'), 'utf8'),
      );
      expect(JSON.stringify(organization)).toContain(organizationB);
      expect(JSON.stringify(organization)).not.toContain(organizationA);
      expect(JSON.stringify(contacts)).toContain('contact/b');
      expect(JSON.stringify(contacts)).not.toContain('contact/a');
      expect(JSON.stringify(courses)).toContain('course/b');
      expect(JSON.stringify(courses)).not.toContain('course/a');
      expect(JSON.stringify(jobs)).toContain('job/b');
      expect(JSON.stringify(jobs)).not.toContain('job/a');
      expect(JSON.stringify(departments)).toContain('department/b');
      expect(JSON.stringify(departments)).not.toContain('department/a');
      expect(JSON.stringify(filteredCourses)).toContain(organizationB);
      expect(JSON.stringify(filteredCourses)).not.toContain(organizationA);
      expect(JSON.stringify(filteredCourses)).toContain('mathematics');
      expect(JSON.stringify(filteredCourses)).toContain('science');
      const manifest = parseStrictJson(
        await readFile(
          join(
            root,
            'generated',
            'selected',
            'public',
            '.well-known',
            'educational-organization-manifest',
          ),
          'utf8',
        ),
      );
      if (!isJsonObject(manifest)) throw new Error('Generated manifest must be an object.');
      expect(manifest.publisher).toMatchObject({ id: organizationB });

      await writeFile(
        join(root, 'source', 'contacts.yaml'),
        [
          'items:',
          '  - id: https://network.example/id/contact/a',
          '    role: Admissions A',
          `    organization: ${organizationA}`,
          '',
        ].join('\n'),
      );
      const noContacts = await buildPublication({
        configFile: join(root, 'eom.config.yaml'),
        outputRoot: join(root, 'generated', 'no-contacts', 'public'),
        mode: 'organization',
        organization: organizationB,
      });
      expect(noContacts.valid, JSON.stringify(noContacts.findings)).toBe(true);
      const noContactsDocument = parseStrictJson(
        await readFile(
          join(root, 'generated', 'no-contacts', 'public', 'eom', 'contacts.json'),
          'utf8',
        ),
      );
      expect(noContactsDocument).toMatchObject({ contacts: [] });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('applies restricted imports and overlays and can sign the generated publication', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-generator-overlay-signing-'));
    try {
      const { privateKey } = generateKeyPairSync('ed25519');
      const keyId = 'https://overlay.example/eom/keys#build-2027';
      const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
      await writeFile(join(root, 'signing-key.pem'), privateKeyPem, 'utf8');
      await writeFile(
        join(root, 'eom.config.yaml'),
        [
          'project: { name: Overlay School, protocolVersion: "1.0", defaultLanguage: en-US }',
          'publisher: { origin: https://overlay.example, manifestPath: /.well-known/educational-organization-manifest }',
          'source:',
          '  root: source',
          '  modules:',
          '    organization: [organization.yaml]',
          '    courses: [courses.yaml]',
          '  imports:',
          '    - module: courses',
          '      patterns: [imports.yaml]',
          '  overlays:',
          '    - name: jurisdiction-overlay',
          '      owner: https://overlay.example/id/jurisdiction',
          '      priority: 10',
          '      modules:',
          '        courses: [overlays.yaml]',
          '      allowedPointers: [/description]',
          'output: { root: generated/public }',
          'signing:',
          '  enabled: true',
          '  keyFile: signing-key.pem',
          `  keyId: ${keyId}`,
          '',
        ].join('\n'),
      );
      await mkdir(join(root, 'source'), { recursive: true });
      await writeFile(
        join(root, 'source', 'organization.yaml'),
        'id: https://overlay.example/id/school\ntype: secondary-school\nname: Overlay School\n',
      );
      await writeFile(
        join(root, 'source', 'courses.yaml'),
        'id: https://overlay.example/id/course/base\ntype: course\nname: Base Course\nprovider: https://overlay.example/id/school\n',
      );
      await writeFile(
        join(root, 'source', 'imports.yaml'),
        'id: https://overlay.example/id/course/imported\ntype: course\nname: Imported Course\nprovider: https://overlay.example/id/school\n',
      );
      await writeFile(
        join(root, 'source', 'overlays.yaml'),
        'id: https://overlay.example/id/course/base\ndescription: Jurisdiction-maintained description\n',
      );

      const report = await buildPublication({
        configFile: join(root, 'eom.config.yaml'),
        outputRoot: join(root, 'generated', 'public'),
        now: new Date('2027-01-01T00:00:00Z'),
        cacheDirectory: join(root, '.cache'),
      });
      expect(report.valid, JSON.stringify(report.findings)).toBe(true);
      expect(report.written).toBe(true);
      expect(report.overlays).toHaveLength(1);
      expect(report.signature).toMatchObject({ enabled: true, keyId, valid: true });
      const organization = parseStrictJson(
        await readFile(join(root, 'generated', 'public', 'eom', 'organization.json'), 'utf8'),
      );
      const signature = parseStrictJson(
        await readFile(join(root, 'generated', 'public', 'eom', 'signature.json'), 'utf8'),
      );
      const keySet = parseStrictJson(
        await readFile(join(root, 'generated', 'public', 'eom', 'keys.json'), 'utf8'),
      );
      expect(
        verifyDetached(organization, signature, keySet, {
          now: new Date('2027-01-01T00:00:00Z'),
        }).overall,
      ).toBe(true);
      const courses = parseStrictJson(
        await readFile(join(root, 'generated', 'public', 'eom', 'courses.json'), 'utf8'),
      );
      expect(
        isJsonObject(courses) &&
          Array.isArray(courses.items) &&
          courses.items.some(
            (item) =>
              isJsonObject(item) && item.description === 'Jurisdiction-maintained description',
          ),
      ).toBe(true);
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

  it('does not replace a complete publication with an unsafe in-place module build', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-generator-partial-safety-'));
    try {
      const output = join(root, 'public');
      const full = await buildPublication({
        configFile: join(process.cwd(), 'examples/ecme-high/source/eom.config.yaml'),
        outputRoot: output,
        allowExternalOutput: true,
        now: new Date('2027-01-01T00:00:00Z'),
      });
      expect(full.valid, JSON.stringify(full.findings)).toBe(true);
      const before = await readFile(join(output, 'eom', 'courses.json'), 'utf8');
      const partial = await buildPublication({
        configFile: join(process.cwd(), 'examples/ecme-high/source/eom.config.yaml'),
        outputRoot: output,
        allowExternalOutput: true,
        module: 'news',
        now: new Date('2027-01-01T00:00:00Z'),
      });
      expect(partial.valid).toBe(false);
      expect(partial.written).toBe(false);
      expect(await readFile(join(output, 'eom', 'courses.json'), 'utf8')).toBe(before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not replace a partial bundle selected for a different module', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-generator-selector-safety-'));
    try {
      const configFile = join(root, 'eom.config.yaml');
      await writeFile(
        configFile,
        [
          'project: { name: Selector Safety, protocolVersion: "1.0", defaultLanguage: en-US }',
          'publisher: { origin: https://selector-safety.example, manifestPath: /.well-known/educational-organization-manifest }',
          'source: { root: source, modules: { organization: [organization.yaml], departments: [departments.yaml], programs: [programs.yaml], courses: [courses.yaml] } }',
          'output: { root: generated/public }',
          'signing: { enabled: false }',
          '',
        ].join('\n'),
      );
      await mkdir(join(root, 'source'), { recursive: true });
      await writeFile(
        join(root, 'source', 'organization.yaml'),
        'id: https://selector-safety.example/id/school\ntype: school\nname: Selector Safety\n',
      );
      await writeFile(
        join(root, 'source', 'courses.yaml'),
        'id: https://selector-safety.example/id/course/one\ntype: course\nname: One\nprovider: https://selector-safety.example/id/school\n',
      );
      await writeFile(join(root, 'source', 'departments.yaml'), 'items: []\n');
      await writeFile(join(root, 'source', 'programs.yaml'), 'items: []\n');
      const output = join(root, 'partial', 'public');
      const first = await buildPublication({
        configFile,
        outputRoot: output,
        mode: 'module',
        module: 'courses',
        allowExternalOutput: true,
      });
      expect(first.valid, JSON.stringify(first.findings)).toBe(true);
      const second = await buildPublication({
        configFile,
        outputRoot: output,
        mode: 'module',
        module: 'organization',
        allowExternalOutput: true,
      });
      expect(second.valid).toBe(false);
      expect(second.findings.some((item) => item.code === 'EOM_GENERATOR_OUTPUT_UNSAFE')).toBe(
        true,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('recovers a journaled interrupted publication replacement before building', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-generator-recovery-'));
    try {
      const configFile = join(root, 'eom.config.yaml');
      await writeFile(
        configFile,
        [
          'project: { name: Recovery, protocolVersion: "1.0", defaultLanguage: en-US }',
          'publisher: { origin: https://recovery.example, manifestPath: /.well-known/educational-organization-manifest }',
          'source: { root: source, modules: { organization: [organization.yaml] } }',
          'output: { root: generated/public }',
          'signing: { enabled: false }',
          '',
        ].join('\n'),
      );
      await mkdir(join(root, 'source'), { recursive: true });
      await writeFile(
        join(root, 'source', 'organization.yaml'),
        'id: https://recovery.example/id/school\ntype: school\nname: Recovery\n',
      );
      const output = join(root, 'generated', 'public');
      const build = join(root, 'generated', 'build');
      const first = await buildPublication({ configFile, outputRoot: output });
      expect(first.valid).toBe(true);

      const transaction = join(root, 'generated', '.eom-replace-recovery');
      await mkdir(transaction);
      await rename(output, join(transaction, 'publication.previous'));
      await rename(build, join(transaction, 'build.previous'));
      await writeFile(
        join(transaction, 'journal.json'),
        JSON.stringify({
          version: 1,
          status: 'build-moved',
          publicationTarget: 'public',
          buildTarget: 'build',
          publicationBackup: 'publication.previous',
          buildBackup: 'build.previous',
          expected: {
            buildMode: 'full',
            projectIdentity: 'https://recovery.example|Recovery|1.0',
            selector: {},
          },
        }),
        'utf8',
      );

      const recovered = await buildPublication({ configFile, outputRoot: output });
      expect(recovered.valid, JSON.stringify(recovered.findings)).toBe(true);
      expect(recovered.written).toBe(true);
      expect(await readFile(join(output, 'eom', 'organization.json'), 'utf8')).toContain(
        'Recovery',
      );
      await expect(readFile(join(transaction, 'journal.json'), 'utf8')).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
