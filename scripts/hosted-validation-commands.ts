export interface HostedValidationStep {
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

function step(command: string, ...args: string[]): HostedValidationStep {
  return { command, args };
}

/**
 * Checks that are safe to run against an arbitrary clean pull-request
 * revision. Release-bound receipt, release-packet, and reproducibility checks
 * intentionally remain in `pnpm verify` and the manual candidate workflow.
 */
export const HOSTED_VALIDATION_STEPS: readonly HostedValidationStep[] = [
  step('format:check'),
  step('prompts:check'),
  step('build'),
  step('schema:check'),
  step('vocabulary:check'),
  step('module:check'),
  step('ownership:check'),
  step('fixtures:check'),
  step('conformance:check'),
  step('actions:check'),
  step('workflow:check'),
  step('generate:drift'),
  step('typecheck'),
  step('test', '--', '--runInBand'),
  step('test:coverage'),
  step('test:browser'),
  step('lint'),
  step('policy:check'),
  step('verify:security'),
  step('license:check'),
  step('dependency:check'),
  step('audit:prod'),
  step('packages:check'),
  step('conformance'),
  step('conformance:profiles'),
  step('verify:determinism'),
  step('verify:examples'),
  step('docs:build'),
  step('docs:check'),
  {
    command: 'traceability:check',
    args: [],
    env: { EOM_TRACEABILITY_MODE: 'hosted' },
  },
];
