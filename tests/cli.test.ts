import { describe, expect, it } from 'vitest';
import { createCli } from '@paperandslate/eom-cli';

describe('EOM CLI command surface', () => {
  it('exposes the safe consumer and authoring commands', () => {
    const names = createCli()
      .commands.map((command) => command.name())
      .sort();
    expect(names).toEqual([
      'build',
      'candidate',
      'check',
      'conformance',
      'diff',
      'doctor',
      'explain',
      'fetch',
      'init',
      'inspect',
      'lint',
      'map',
      'migrate',
      'schema',
      'sign',
      'validate',
      'verify',
    ]);
  });
});
