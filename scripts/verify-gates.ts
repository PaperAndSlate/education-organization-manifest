export interface VerifyGate {
  readonly command: string;
  readonly args: readonly string[];
}

/**
 * The commands that make up the aggregate local gate. Keep this list explicit
 * so a receipt cannot be forged by copying a prose description of `verify`.
 */
export const AGGREGATE_VERIFY_GATES: readonly VerifyGate[] = [
  { command: 'pnpm format:check', args: ['format:check'] },
  { command: 'pnpm prompts:check', args: ['prompts:check'] },
  { command: 'pnpm build', args: ['build'] },
  { command: 'pnpm schema:check', args: ['schema:check'] },
  { command: 'pnpm vocabulary:check', args: ['vocabulary:check'] },
  { command: 'pnpm module:check', args: ['module:check'] },
  { command: 'pnpm ownership:check', args: ['ownership:check'] },
  { command: 'pnpm fixtures:check', args: ['fixtures:check'] },
  { command: 'pnpm conformance:check', args: ['conformance:check'] },
  { command: 'pnpm actions:check', args: ['actions:check'] },
  { command: 'pnpm workflow:check', args: ['workflow:check'] },
  { command: 'pnpm generate:drift', args: ['generate:drift'] },
  { command: 'pnpm typecheck', args: ['typecheck'] },
  { command: 'pnpm test', args: ['test', '--', '--runInBand'] },
  { command: 'pnpm test:coverage', args: ['test:coverage'] },
  { command: 'pnpm test:browser', args: ['test:browser'] },
  { command: 'pnpm lint', args: ['lint'] },
  { command: 'pnpm policy:check', args: ['policy:check'] },
  { command: 'pnpm verify:security', args: ['verify:security'] },
  { command: 'pnpm license:check', args: ['license:check'] },
  { command: 'pnpm dependency:check', args: ['dependency:check'] },
  { command: 'pnpm audit:prod', args: ['audit:prod'] },
  { command: 'pnpm packages:check', args: ['packages:check'] },
  { command: 'pnpm conformance', args: ['conformance'] },
  { command: 'pnpm conformance:profiles', args: ['conformance:profiles'] },
  { command: 'pnpm verify:determinism', args: ['verify:determinism'] },
  { command: 'pnpm verify:examples', args: ['verify:examples'] },
  { command: 'pnpm docs:build', args: ['docs:build'] },
  { command: 'pnpm docs:check', args: ['docs:check'] },
  { command: 'pnpm release:check', args: ['release:check'] },
  { command: 'pnpm verify:release-reproducibility', args: ['verify:release-reproducibility'] },
];

export function commandKey(command: string): string {
  const match = /^pnpm\s+([A-Za-z0-9:_-]+)/u.exec(command.trim());
  return match?.[1] ?? command.trim();
}

export const AGGREGATE_VERIFY_COMMAND_KEYS = Object.freeze(
  AGGREGATE_VERIFY_GATES.map((gate) => commandKey(gate.command)),
);
