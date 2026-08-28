import { join, resolve } from 'node:path';
import { format as formatPrettier } from 'prettier';
import {
  createSecurityScanProjection,
  readCanonicalSecurityScan,
  renderSecurityScanProjection,
  SECURITY_SCAN_PROJECTION,
} from './security-scan-evidence.js';
import { atomicWriteFile, ensureRealDirectoryTree } from './atomic-write.js';

const root = resolve(process.cwd());
const canonical = await readCanonicalSecurityScan(root);
const projection = createSecurityScanProjection(canonical);
const projectionPath = join(root, SECURITY_SCAN_PROJECTION);
const projectionText = await formatPrettier(JSON.stringify(projection, null, 2), {
  filepath: projectionPath,
  parser: 'json',
});

const reportsRoot = join(root, 'reports');
await ensureRealDirectoryTree(reportsRoot);
await atomicWriteFile(projectionPath, projectionText);
await atomicWriteFile(
  join(root, 'reports', 'security-scan.md'),
  renderSecurityScanProjection(canonical),
);

console.log(
  `recorded sealed Standard scan ${canonical.scanId} for ${canonical.targetCommit} (${canonical.targetTree})`,
);
