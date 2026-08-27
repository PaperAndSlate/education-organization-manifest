import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { format as formatPrettier } from 'prettier';
import {
  createSecurityScanProjection,
  readCanonicalSecurityScan,
  renderSecurityScanProjection,
  SECURITY_SCAN_PROJECTION,
} from './security-scan-evidence.js';

const root = resolve(process.cwd());
const canonical = await readCanonicalSecurityScan(root);
const projection = createSecurityScanProjection(canonical);
const projectionPath = join(root, SECURITY_SCAN_PROJECTION);
const projectionText = await formatPrettier(JSON.stringify(projection, null, 2), {
  filepath: projectionPath,
  parser: 'json',
});

await mkdir(join(root, 'reports'), { recursive: true });
await writeFile(projectionPath, projectionText, 'utf8');
await writeFile(
  join(root, 'reports', 'security-scan.md'),
  renderSecurityScanProjection(canonical),
  'utf8',
);

console.log(
  `recorded sealed Standard scan ${canonical.scanId} for ${canonical.targetCommit} (${canonical.targetTree})`,
);
