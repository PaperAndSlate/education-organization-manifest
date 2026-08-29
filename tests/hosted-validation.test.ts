import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkWorkflowActionPins } from '../scripts/check-action-pins.js';
import { atomicWriteFile } from '../scripts/atomic-write.js';
import { HOSTED_VALIDATION_STEPS } from '../scripts/hosted-validation-commands.js';
import { safeChildEnvironment } from '../scripts/safe-child-env.js';
import { statusBlocksTraceability } from '../scripts/traceability-policy.js';

describe('hosted validation contract', () => {
  const commands = HOSTED_VALIDATION_STEPS.map((entry) => entry.command);

  it('keeps each hosted command unique and covers the repository quality gates', () => {
    expect(new Set(commands).size).toBe(commands.length);
    expect(commands).toEqual(
      expect.arrayContaining([
        'format:check',
        'build',
        'schema:check',
        'vocabulary:check',
        'module:check',
        'fixtures:check',
        'typecheck',
        'test',
        'test:coverage',
        'test:browser',
        'lint',
        'verify:security',
        'license:check',
        'dependency:check',
        'audit:prod',
        'packages:check',
        'conformance',
        'conformance:profiles',
        'actions:check',
        'workflow:check',
        'verify:determinism',
        'verify:examples',
        'docs:build',
        'docs:check',
        'traceability:check',
      ]),
    );
  });

  it('does not run release-bound evidence commands on arbitrary pull requests', () => {
    expect(commands).not.toEqual(expect.arrayContaining(['verify', 'verify:record']));
    expect(commands).not.toEqual(
      expect.arrayContaining(['release:check', 'verify:release-reproducibility']),
    );
  });

  it('forwards the test runner isolation flag without invoking a shell', () => {
    expect(HOSTED_VALIDATION_STEPS.find((entry) => entry.command === 'test')?.args).toEqual([
      '--',
      '--runInBand',
    ]);
  });

  it('uses an explicit structural traceability mode for arbitrary revisions', () => {
    expect(HOSTED_VALIDATION_STEPS.find((entry) => entry.command === 'traceability:check')).toEqual(
      {
        command: 'traceability:check',
        args: [],
        env: { EOM_TRACEABILITY_MODE: 'hosted' },
      },
    );
  });

  it('retains platform command-launch variables for isolated child processes', () => {
    const environment = safeChildEnvironment();
    expect(environment.CI).toBe('true');
    expect(environment.TZ).toBe('UTC');
    if (process.platform === 'win32') {
      expect(environment.ComSpec ?? environment.COMSPEC).toBeTruthy();
      expect(environment.PATHEXT).toBeTruthy();
    }
  });

  it('restricts manual release evidence to a protected default branch', async () => {
    const workflow = await readFile('.github/workflows/release-candidate.yml', 'utf8');
    expect(workflow).toContain("if: github.ref == 'refs/heads/main' && github.ref_protected");
    expect(workflow).toContain('fsfe/reuse-action@676e2d560c9a403aa252096d99fcab3e1132b0f5');
  });

  it('allows open status only for structural hosted traceability checks', () => {
    expect(statusBlocksTraceability('open', true)).toBe(false);
    expect(statusBlocksTraceability('open', false)).toBe(true);
    expect(statusBlocksTraceability('verified-local', false)).toBe(false);
  });

  it('parses workflow YAML strictly before inspecting nested action references', () => {
    expect(
      checkWorkflowActionPins(
        [
          'jobs:',
          '  build:',
          '    steps:',
          '      - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09',
        ].join('\n'),
        'fixture.yml',
      ),
    ).toEqual([]);

    expect(
      checkWorkflowActionPins('jobs:\n  build:\n    uses: actions/checkout@v4\n', 'fixture.yml'),
    ).toEqual([expect.stringContaining('not pinned to a 40-character commit SHA')]);

    expect(
      checkWorkflowActionPins(
        'jobs:\n  build: &job\n    name: build\n  test: *job\n',
        'fixture.yml',
      ),
    ).toEqual([expect.stringContaining('Alias')]);

    expect(
      checkWorkflowActionPins('jobs:\n  build:\n    name: one\n    name: two\n', 'fixture.yml'),
    ).toEqual([expect.stringContaining('Map keys must be unique')]);
  });

  it('replaces generated files without a deletion window and rejects link destinations', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-atomic-write-'));
    try {
      const destination = join(root, 'result.json');
      await writeFile(destination, 'old\n', 'utf8');
      await atomicWriteFile(destination, 'new\n');
      await expect(readFile(destination, 'utf8')).resolves.toBe('new\n');

      const link = join(root, 'link.json');
      try {
        await symlink(destination, link, 'file');
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          ['EACCES', 'EPERM'].includes(String(error.code))
        ) {
          return;
        }
        throw error;
      }
      await expect(atomicWriteFile(link, 'unsafe\n')).rejects.toThrow(
        'generated output destination must be a regular file',
      );
      await expect(readFile(destination, 'utf8')).resolves.toBe('new\n');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
