import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createCli } from '@paperandslate/eom-cli';

const execFileAsync = promisify(execFile);

describe('EOM CLI command surface', () => {
  it('exposes the safe consumer and authoring commands', () => {
    const names = createCli()
      .commands.map((command) => command.name())
      .sort();
    expect(names).toEqual([
      'audit-url',
      'build',
      'candidate',
      'check',
      'completion',
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

  it('generates shell completion scripts for every supported shell', async () => {
    const tsx = resolve('node_modules/tsx/dist/cli.mjs');
    const entry = resolve('packages/cli/src/index.ts');
    for (const [shell, marker] of [
      ['bash', 'complete -F _eom_complete eom'],
      ['zsh', '#compdef eom'],
      ['fish', 'complete -c eom'],
      ['powershell', 'Register-ArgumentCompleter'],
    ] as const) {
      const result = await execFileAsync(process.execPath, [tsx, entry, 'completion', shell], {
        cwd: resolve('.'),
      });
      expect(result.stdout).toContain(marker);
    }
  }, 15_000);

  it('returns a stable usage exit code for invalid build modes', async () => {
    const tsx = resolve('node_modules/tsx/dist/cli.mjs');
    const entry = resolve('packages/cli/src/index.ts');
    await expect(
      execFileAsync(process.execPath, [tsx, entry, 'build', '--mode', 'unsafe'], {
        cwd: resolve('.'),
      }),
    ).rejects.toMatchObject({ code: 2 });
  });

  it('refuses to initialize through an existing source junction', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-cli-init-safety-'));
    const external = await mkdtemp(join(tmpdir(), 'eom-cli-init-external-'));
    try {
      const project = join(root, 'project');
      const source = join(project, 'source');
      await mkdir(project);
      try {
        await symlink(external, source, 'junction');
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          (error.code === 'EPERM' || error.code === 'EACCES')
        ) {
          return;
        }
        throw error;
      }
      const tsx = resolve('node_modules/tsx/dist/cli.mjs');
      const entry = resolve('packages/cli/src/index.ts');
      await expect(
        execFileAsync(
          process.execPath,
          [
            tsx,
            entry,
            'init',
            project,
            '--template',
            'minimal-school',
            '--origin',
            'https://safe.example',
            '--force',
          ],
          { cwd: resolve('.') },
        ),
      ).rejects.toMatchObject({ code: 4 });
      await expect(readFile(join(external, 'organization.yaml'), 'utf8')).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(external, { recursive: true, force: true });
    }
  });

  it('refuses to treat an existing starter symlink as a safe skipped file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-cli-init-file-link-'));
    const external = await mkdtemp(join(tmpdir(), 'eom-cli-init-file-link-external-'));
    try {
      const project = join(root, 'project');
      const externalConfig = join(external, 'eom.config.yaml');
      await mkdir(project);
      await writeFile(externalConfig, 'do-not-overwrite\n', 'utf8');
      try {
        await symlink(externalConfig, join(project, 'eom.config.yaml'), 'file');
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          (error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'EINVAL')
        ) {
          return;
        }
        throw error;
      }
      const tsx = resolve('node_modules/tsx/dist/cli.mjs');
      const entry = resolve('packages/cli/src/index.ts');
      await expect(
        execFileAsync(
          process.execPath,
          [tsx, entry, 'init', project, '--origin', 'https://safe.example', '--force'],
          { cwd: resolve('.') },
        ),
      ).rejects.toMatchObject({ code: 4 });
      await expect(readFile(externalConfig, 'utf8')).resolves.toBe('do-not-overwrite\n');
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(external, { recursive: true, force: true });
    }
  });

  it('does not initialize a project through a symlinked parent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-cli-init-parent-safety-'));
    const external = await mkdtemp(join(tmpdir(), 'eom-cli-init-parent-external-'));
    try {
      const linkedParent = join(root, 'linked-parent');
      try {
        await symlink(external, linkedParent, 'junction');
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          (error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'EINVAL')
        ) {
          return;
        }
        throw error;
      }
      const tsx = resolve('node_modules/tsx/dist/cli.mjs');
      const entry = resolve('packages/cli/src/index.ts');
      await expect(
        execFileAsync(
          process.execPath,
          [tsx, entry, 'init', join(linkedParent, 'project'), '--origin', 'https://safe.example'],
          { cwd: resolve('.') },
        ),
      ).rejects.toMatchObject({ code: 2 });
      await expect(
        readFile(join(external, 'project', 'eom.config.yaml'), 'utf8'),
      ).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(external, { recursive: true, force: true });
    }
  });

  it('initializes a bounded district project and runs diff/migrate workflows', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-cli-integration-'));
    try {
      const project = join(root, 'district');
      const tsx = resolve('node_modules/tsx/dist/cli.mjs');
      const entry = resolve('packages/cli/src/index.ts');
      await execFileAsync(
        process.execPath,
        [
          tsx,
          entry,
          'init',
          project,
          '--template',
          'district',
          '--origin',
          'https://district.example',
          '--modules',
          'courses,transportation',
          '--json',
        ],
        { cwd: resolve('.') },
      );
      expect(await readFile(join(project, 'source', 'organization.yaml'), 'utf8')).toContain(
        'id: https://district.example/id/district',
      );
      expect(await readFile(join(project, 'source', 'modules', 'courses.yaml'), 'utf8')).toBe(
        'items: []\n',
      );
      const config = await readFile(join(project, 'eom.config.yaml'), 'utf8');
      expect(config).toContain('modules/courses.yaml');
      expect(config).toContain('modules/transportation.yaml');

      const before = join(root, 'before.json');
      const after = join(root, 'after.json');
      await writeFile(
        before,
        JSON.stringify({
          type: 'organization-profile',
          id: 'https://district.example/id/school',
          name: 'Before',
        }),
        'utf8',
      );
      await writeFile(
        after,
        JSON.stringify({
          type: 'organization-profile',
          id: 'https://district.example/id/school',
          name: 'After',
        }),
        'utf8',
      );
      const diff = await execFileAsync(
        process.execPath,
        [tsx, entry, 'diff', before, after, '--json'],
        { cwd: resolve('.') },
      );
      expect(diff.stdout).toContain('"command": "diff"');
      expect(diff.stdout).toContain('"kind": "changed"');

      const diffOutput = join(root, 'diff-report.json');
      await writeFile(diffOutput, 'stale report\n', 'utf8');
      await execFileAsync(
        process.execPath,
        [tsx, entry, 'diff', before, after, '--output', diffOutput],
        { cwd: resolve('.') },
      );
      expect(await readFile(diffOutput, 'utf8')).toContain('"kind": "changed"');

      const legacy = join(root, 'legacy.json');
      const migrated = join(root, 'migrated.json');
      await writeFile(
        legacy,
        JSON.stringify({
          kind: 'organization-profile',
          uri: 'https://district.example/id/school',
          title: 'Legacy',
        }),
        'utf8',
      );
      await execFileAsync(
        process.execPath,
        [tsx, entry, 'migrate', legacy, '--from', '0.9', '--output', migrated, '--json'],
        { cwd: resolve('.') },
      );
      const migratedDocument = JSON.parse(await readFile(migrated, 'utf8')) as Record<
        string,
        unknown
      >;
      expect(migratedDocument).toMatchObject({
        type: 'organization-profile',
        id: 'https://district.example/id/school',
        name: 'Legacy',
        version: '1.0',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not let validation-only check output replace the configured publication', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-cli-check-safety-'));
    try {
      const project = join(root, 'project');
      const tsx = resolve('node_modules/tsx/dist/cli.mjs');
      const entry = resolve('packages/cli/src/index.ts');
      await execFileAsync(
        process.execPath,
        [tsx, entry, 'init', project, '--origin', 'https://check.example'],
        { cwd: resolve('.') },
      );
      await expect(
        execFileAsync(
          process.execPath,
          [
            tsx,
            entry,
            'check',
            join(project, 'eom.config.yaml'),
            '--output',
            join(project, 'generated', 'public'),
          ],
          { cwd: resolve('.') },
        ),
      ).rejects.toMatchObject({ code: 2 });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps validation-only checks report-only even when an output path is supplied', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-cli-check-report-only-'));
    try {
      const project = join(root, 'project');
      const output = join(project, 'check-output');
      const tsx = resolve('node_modules/tsx/dist/cli.mjs');
      const entry = resolve('packages/cli/src/index.ts');
      await execFileAsync(
        process.execPath,
        [tsx, entry, 'init', project, '--origin', 'https://check-report-only.example'],
        { cwd: resolve('.') },
      );
      const result = await execFileAsync(
        process.execPath,
        [tsx, entry, 'check', join(project, 'eom.config.yaml'), '--output', output, '--json'],
        { cwd: resolve('.') },
      );
      const parsed = JSON.parse(result.stdout) as {
        report?: { dryRun?: boolean; written?: boolean };
      };
      expect(parsed.report).toMatchObject({ dryRun: true, written: false });
      await expect(stat(output)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not create report output directories through a symlink', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-cli-output-safety-'));
    const external = await mkdtemp(join(tmpdir(), 'eom-cli-output-external-'));
    try {
      const link = join(root, 'linked-output');
      try {
        await symlink(external, link, 'junction');
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          (error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'EINVAL')
        ) {
          return;
        }
        throw error;
      }
      const before = join(root, 'before.json');
      const after = join(root, 'after.json');
      await writeFile(
        before,
        JSON.stringify({
          type: 'organization-profile',
          id: 'https://example.test/id/a',
          name: 'Before',
        }),
        'utf8',
      );
      await writeFile(
        after,
        JSON.stringify({
          type: 'organization-profile',
          id: 'https://example.test/id/a',
          name: 'After',
        }),
        'utf8',
      );
      const tsx = resolve('node_modules/tsx/dist/cli.mjs');
      const entry = resolve('packages/cli/src/index.ts');
      await expect(
        execFileAsync(
          process.execPath,
          [tsx, entry, 'diff', before, after, '--output', join(link, 'nested', 'report.json')],
          { cwd: resolve('.') },
        ),
      ).rejects.toMatchObject({ code: 2 });
      await expect(stat(join(external, 'nested'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(external, { recursive: true, force: true });
    }
  });

  it('applies user and environment defaults without overriding explicit CLI flags', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eom-cli-options-'));
    const previousUserConfig = process.env.EOM_USER_CONFIG;
    const previousJson = process.env.EOM_JSON;
    try {
      const userConfig = join(root, 'config.json');
      await writeFile(
        userConfig,
        JSON.stringify({ json: true, offline: true, timeout: 1200, cacheDir: join(root, 'cache') }),
        'utf8',
      );
      process.env.EOM_USER_CONFIG = userConfig;
      process.env.EOM_JSON = 'false';
      const cli = createCli();
      expect(cli.opts()).toMatchObject({ json: false, offline: true, timeout: 1200 });

      const tsx = resolve('node_modules/tsx/dist/cli.mjs');
      const entry = resolve('packages/cli/src/index.ts');
      const result = await execFileAsync(process.execPath, [tsx, entry, 'schema', '--json'], {
        cwd: resolve('.'),
        env: { ...process.env, EOM_JSON: 'false', EOM_USER_CONFIG: userConfig },
      });
      expect(JSON.parse(result.stdout)).toMatchObject({ command: 'schema' });
    } finally {
      if (previousUserConfig === undefined) delete process.env.EOM_USER_CONFIG;
      else process.env.EOM_USER_CONFIG = previousUserConfig;
      if (previousJson === undefined) delete process.env.EOM_JSON;
      else process.env.EOM_JSON = previousJson;
      await rm(root, { recursive: true, force: true });
    }
  });
});
