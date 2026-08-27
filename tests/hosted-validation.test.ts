import { describe, expect, it } from 'vitest';
import { HOSTED_VALIDATION_STEPS } from '../scripts/hosted-validation-commands.js';

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
});
