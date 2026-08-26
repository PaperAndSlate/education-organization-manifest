import { join, resolve } from 'node:path';
import { buildPublication } from '@paperandslate/eom-generator';

const [sourceArgument, outputArgument] = process.argv.slice(2);
if (!sourceArgument || !outputArgument) {
  console.error('Usage: tsx scripts/build-example.ts <source-directory> <generated-directory>');
  process.exitCode = 2;
} else {
  const sourceDirectory = resolve(sourceArgument);
  const outputDirectory = resolve(outputArgument);
  const report = await buildPublication({
    configFile: join(sourceDirectory, 'eom.config.yaml'),
    outputRoot: join(outputDirectory, 'public'),
    now: new Date('2027-01-01T00:00:00Z'),
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.valid) process.exitCode = 1;
}
