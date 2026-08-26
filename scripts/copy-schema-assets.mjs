import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destinationArgument = process.argv[2];
if (!destinationArgument) throw new Error('A schema asset destination is required.');

const destination = resolve(root, destinationArgument);
await rm(destination, { recursive: true, force: true });
await mkdir(dirname(destination), { recursive: true });
await cp(resolve(root, 'schemas', '1.0'), resolve(destination, '1.0'), { recursive: true });
