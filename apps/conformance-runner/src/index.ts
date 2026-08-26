import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { stringifyCanonical } from '@paperandslate/eom-core';
import { runConformance } from '@paperandslate/eom-testkit';

export async function runConformanceCli(
  args: readonly string[] = process.argv.slice(2),
): Promise<number> {
  const directory = args[0];
  if (!directory) {
    console.error('Usage: eom-conformance <publication-directory>');
    return 2;
  }
  const report = await runConformance({ directory });
  process.stdout.write(stringifyCanonical(report as never));
  return report.status === 'non-conforming' ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runConformanceCli();
}
