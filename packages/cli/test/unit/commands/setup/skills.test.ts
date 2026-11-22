import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'path';
import fs from 'fs-extra';
import { client } from '../../../mocks/client';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import setup from '../../../../src/commands/setup';
import { readBundledCliSkill } from '../../../../src/util/skills/bundled-files';

const vercelCliSkill = readBundledCliSkill();

async function readTree(dir: string): Promise<Record<string, string>> {
  const tree: Record<string, string> = {};
  const walk = async (current: string, prefix: string) => {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(join(current, entry.name), path);
      } else {
        tree[path] = await fs.readFile(join(current, entry.name), 'utf8');
      }
    }
  };
  await walk(dir, '');
  return tree;
}

// An older vercel-cli skill: only a directory whose SKILL.md names the skill
// is replaced.
const OUTDATED_SKILL =
  '---\nname: vercel-cli\ndescription: An older version.\n---\n\nOld instructions.\n';

// Paths are shown with native separators, so build expectations with join().
const shownDefault = join('~', '.agents', 'skills', 'vercel-cli');

const expectedTree = Object.fromEntries(
  vercelCliSkill.files.map(file => [file.path, file.content])
);

describe('setup skills', () => {
  let cwd: string;
  let home: string;
  let defaultDestination: string;

  beforeEach(() => {
    client.reset();
    cwd = setupTmpDir();
    client.cwd = cwd;
    home = setupTmpDir();
    // os.homedir() reads HOME on POSIX and USERPROFILE on Windows.
    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', home);
    defaultDestination = join(home, '.agents/skills/vercel-cli');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('bundles the repository vercel-cli skill', () => {
    expect(vercelCliSkill.files.map(file => file.path)).toContain('SKILL.md');
  });

  it('writes the vercel-cli skill into --output', async () => {
    client.setArgv('setup', 'skills', '--output', '.agents/skills/vercel-cli');

    const exitCode = await setup(client);

    expect(exitCode).toBe(0);
    expect(await readTree(join(cwd, '.agents/skills/vercel-cli'))).toEqual(
      expectedTree
    );
    expect(client.stderr.getFullOutput()).toContain('Added');
    expect(client.stderr.getFullOutput()).toContain(
      join('.agents', 'skills', 'vercel-cli')
    );
    expect(
      (await fs.readdir(join(cwd, '.agents/skills'))).filter(name =>
        name.startsWith('.')
      )
    ).toEqual([]);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:skills', value: 'skills' },
      { key: 'option:output', value: '[REDACTED]' },
    ]);
  });

  it('writes to ~/.agents/skills/vercel-cli by default', async () => {
    client.setArgv('setup', 'skills');

    expect(await setup(client)).toBe(0);
    expect(await readTree(defaultDestination)).toEqual(expectedTree);
    expect(client.stderr.getFullOutput()).toContain(shownDefault);
    expect(await fs.readdir(cwd)).toEqual([]);
  });

  it('updates an older vercel-cli skill in the default location without asking', async () => {
    await fs.outputFile(join(defaultDestination, 'SKILL.md'), OUTDATED_SKILL);
    await fs.outputFile(
      join(defaultDestination, 'references/removed.md'),
      'old\n'
    );
    client.setArgv('setup', 'skills');

    expect(await setup(client)).toBe(0);
    expect(await readTree(defaultDestination)).toEqual(expectedTree);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Replaced');
    expect(stderr).not.toContain('Replace ');
  });

  it('updates non-interactively and reports the replacement as JSON', async () => {
    await fs.outputFile(join(defaultDestination, 'SKILL.md'), OUTDATED_SKILL);
    client.nonInteractive = true;
    client.setArgv('setup', 'skills', '--json');

    expect(await setup(client)).toBe(0);
    expect(await readTree(defaultDestination)).toEqual(expectedTree);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      outcome: 'added',
      replaced: true,
    });
  });

  it('previews with --dry-run without writing', async () => {
    await fs.outputFile(join(defaultDestination, 'SKILL.md'), OUTDATED_SKILL);
    client.setArgv('setup', 'skills', '--dry-run', '--json');

    expect(await setup(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      outcome: 'planned',
      replaced: true,
      changes: [{ id: defaultDestination, change: 'updated' }],
    });
    expect(
      await fs.readFile(join(defaultDestination, 'SKILL.md'), 'utf8')
    ).toBe(OUTDATED_SKILL);
  });

  it('writes to --output and prints the directory on non-TTY stdout', async () => {
    client.stdout.isTTY = false;
    client.setArgv('setup', 'skills', '--output', 'out/skill');

    const exitCode = await setup(client);

    expect(exitCode).toBe(0);
    expect(await readTree(join(cwd, 'out/skill'))).toEqual(expectedTree);
    expect(client.stdout.getFullOutput()).toBe(`${join(cwd, 'out/skill')}\n`);
  });

  it('reports unchanged when the destination already matches', async () => {
    client.setArgv(
      'setup',
      'skills',
      '--output',
      '.agents/skills/vercel-cli',
      '--json'
    );
    expect(await setup(client)).toBe(0);

    client.reset();
    client.cwd = cwd;
    client.setArgv(
      'setup',
      'skills',
      '--output',
      '.agents/skills/vercel-cli',
      '--json'
    );
    const exitCode = await setup(client);

    expect(exitCode).toBe(0);
    const result = JSON.parse(client.stdout.getFullOutput());
    expect(result).toMatchObject({
      outcome: 'unchanged',
      replaced: false,
      skill: {
        name: 'vercel-cli',
        path: join(cwd, '.agents/skills/vercel-cli'),
      },
    });
    expect(result.skill.files).toEqual(Object.keys(expectedTree));
  });

  it('updates an older vercel-cli skill in --output, removing stale files', async () => {
    const destination = join(cwd, '.agents/skills/vercel-cli');
    await fs.outputFile(join(destination, 'SKILL.md'), OUTDATED_SKILL);
    await fs.outputFile(join(destination, 'references/removed.md'), 'old\n');
    client.setArgv(
      'setup',
      'skills',
      '--output',
      '.agents/skills/vercel-cli',
      '--json'
    );

    expect(await setup(client)).toBe(0);
    expect(await readTree(destination)).toEqual(expectedTree);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      outcome: 'added',
      replaced: true,
    });
  });

  it('returns a conflict document for a directory that is not a vercel-cli skill', async () => {
    await fs.outputFile(join(cwd, 'skills-root', 'notes.md'), 'mine\n');
    client.setArgv('setup', 'skills', '--output', 'skills-root', '--json');

    expect(await setup(client)).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'conflict',
      next: [
        { command: 'vercel setup skills --output skills-root/vercel-cli' },
      ],
    });
    expect(await readTree(join(cwd, 'skills-root'))).toEqual({
      'notes.md': 'mine\n',
    });
  });

  it('refuses a destination that is a file', async () => {
    await fs.outputFile(join(cwd, 'skill'), 'not a directory\n');
    client.setArgv('setup', 'skills', '--output', 'skill');

    expect(await setup(client)).toBe(1);
    expect(await fs.readFile(join(cwd, 'skill'), 'utf8')).toBe(
      'not a directory\n'
    );
  });

  it('rejects positional arguments without writing', async () => {
    client.setArgv(
      'setup',
      'skills',
      'vercel-cli',
      '--output',
      '.agents/skills/vercel-cli'
    );

    expect(await setup(client)).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      "vercel setup skills doesn't take arguments"
    );
    expect(await fs.pathExists(join(cwd, '.agents'))).toBe(false);
  });

  it('rejects unknown options', async () => {
    client.setArgv(
      'setup',
      'skills',
      '--output',
      '.agents/skills/vercel-cli',
      '--plugin'
    );

    expect(await setup(client)).toBe(2);
    expect(await fs.pathExists(join(cwd, '.agents'))).toBe(false);
  });

  it('refuses to write through a symlink that leaves the working directory', async () => {
    const outside = setupTmpDir();
    await fs.symlink(outside, join(cwd, 'linked'));
    client.setArgv('setup', 'skills', '--output', 'linked/vercel-cli');

    expect(await setup(client)).toBe(2);
    expect(await fs.readdir(outside)).toEqual([]);
  });

  it('prints subcommand help', async () => {
    client.setArgv('setup', 'skills', '--help');

    expect(await setup(client)).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('--output');
    expect(client.stderr.getFullOutput()).toContain('--dry-run');
  });

  it('keeps rejecting other positional arguments to bare setup', async () => {
    client.setArgv('setup', 'skill');

    expect(await setup(client)).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'does not accept positional arguments'
    );
  });
  it('never replaces a directory that is not a vercel-cli skill', async () => {
    const root = join(cwd, 'skills-root');
    await fs.outputFile(
      join(root, 'other-skill', 'SKILL.md'),
      '---\nname: other-skill\n---\n'
    );
    client.setArgv('setup', 'skills', '--output', 'skills-root');

    expect(await setup(client)).toBe(1);
    expect(await readTree(root)).toEqual({
      'other-skill/SKILL.md': '---\nname: other-skill\n---\n',
    });
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('not a vercel-cli skill');
    expect(stderr).toContain('setup skills --output skills-root/vercel-cli');
  });

  it('fills an existing empty directory', async () => {
    await fs.mkdirp(join(cwd, 'empty'));
    client.setArgv('setup', 'skills', '--output', 'empty');

    expect(await setup(client)).toBe(0);
    expect(await readTree(join(cwd, 'empty'))).toEqual(expectedTree);
  });

  it('refuses a ..-prefixed directory that symlinks outside the working directory', async () => {
    const outside = setupTmpDir();
    await fs.symlink(outside, join(cwd, '..skills'));
    client.setArgv('setup', 'skills', '--output', '..skills/vercel-cli');

    expect(await setup(client)).toBe(2);
    expect(await fs.readdir(outside)).toEqual([]);
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'returns a JSON error document when writing fails',
    async () => {
      const parent = join(cwd, 'read-only');
      await fs.mkdirp(parent);
      await fs.chmod(parent, 0o500);
      client.setArgv(
        'setup',
        'skills',
        '--output',
        'read-only/vercel-cli',
        '--json'
      );

      try {
        expect(await setup(client)).toBe(1);
        expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
          status: 'error',
          reason: 'write_failed',
        });
      } finally {
        await fs.chmod(parent, 0o700);
      }
    }
  );
});
