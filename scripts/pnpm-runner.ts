import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface PnpmInvocation {
  readonly command: string;
  readonly args: readonly string[];
}

/**
 * Resolve pnpm without relying on Windows shell execution. Corepack's
 * JavaScript entry point is preferred; the cmd.exe fallback keeps a manually
 * installed pnpm usable when Corepack is unavailable.
 */
export function pnpmInvocation(args: readonly string[]): PnpmInvocation {
  if (process.platform === 'win32') {
    const corepackEntryPoint = join(
      dirname(process.execPath),
      'node_modules',
      'corepack',
      'dist',
      'pnpm.js',
    );
    if (existsSync(corepackEntryPoint)) {
      return { command: process.execPath, args: [corepackEntryPoint, ...args] };
    }
    const commandShell = process.env.ComSpec ?? process.env.COMSPEC;
    if (!commandShell) {
      throw new Error('Windows pnpm execution requires ComSpec when Corepack is unavailable.');
    }
    return { command: commandShell, args: ['/d', '/s', '/c', 'pnpm.cmd', ...args] };
  }
  return { command: 'pnpm', args: [...args] };
}
