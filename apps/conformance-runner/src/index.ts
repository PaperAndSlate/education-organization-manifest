import { stringifyCanonical } from '@paperandslate/eom-core';
import { runConformance } from '@paperandslate/eom-testkit';

const directory = process.argv[2];
if (!directory) {
  console.error('Usage: eom-conformance <publication-directory>');
  process.exitCode = 2;
} else {
  const report = await runConformance({ directory });
  process.stdout.write(stringifyCanonical(report as never));
  if (report.status === 'non-conforming') process.exitCode = 1;
}
