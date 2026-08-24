import { describe, expect, it } from 'vitest';
import {
  findHarness,
  inspectProcessTree,
  matchHarness,
  parseProcStat,
  parsePsOutput,
  resolveHarnessVersion,
} from '../../src/proc-tree';

describe('parseProcStat', () => {
  it('parses pid and ppid around a comm with spaces and parens', () => {
    expect(parseProcStat('123 (my (weird) comm) S 456 123 1 0')).toEqual({
      pid: 123,
      ppid: 456,
    });
  });

  it('returns undefined for malformed input', () => {
    expect(parseProcStat('garbage')).toBeUndefined();
  });
});

describe('parsePsOutput', () => {
  it('parses pid, ppid, and full command', () => {
    const table = parsePsOutput(
      [
        '  100     1 /sbin/launchd',
        '  200   100 /bin/zsh -il',
        '  300   200 node /usr/lib/node_modules/@anthropic-ai/claude-code/cli.js --continue',
      ].join('\n')
    );
    expect(table.get(300)).toEqual({
      pid: 300,
      ppid: 200,
      command:
        'node /usr/lib/node_modules/@anthropic-ai/claude-code/cli.js --continue',
    });
  });
});

describe('matchHarness', () => {
  it.each([
    ['node /x/@anthropic-ai/claude-code/cli.js', 'claude'],
    ['/opt/homebrew/bin/claude', 'claude'],
    ['cursor-agent --port 1', 'cursor-cli'],
    ['/usr/local/bin/codex exec', 'codex'],
    ['node /x/@google/gemini-cli/dist/index.js', 'gemini'],
    ['opencode', 'opencode'],
    ['node /x/@github/copilot/index.js', 'github-copilot'],
  ])('matches %s as %s', (command, name) => {
    expect(matchHarness(command)?.name).toBe(name);
  });

  it.each([
    ['/bin/zsh -il'],
    ['node server.js'],
    ['vim claude-notes.md'],
    ['/Users/x/my-claude-project/run.sh'],
  ])('does not match %s', command => {
    expect(matchHarness(command)).toBeUndefined();
  });
});

describe('resolveHarnessVersion', () => {
  const files: Record<string, string> = {
    '/lib/node_modules/@anthropic-ai/claude-code/package.json': JSON.stringify({
      name: '@anthropic-ai/claude-code',
      version: '1.2.3',
    }),
  };
  const readFile = (p: string) => {
    if (p in files) return files[p];
    throw new Error('ENOENT');
  };

  it('finds the nearest matching package.json', () => {
    expect(
      resolveHarnessVersion(
        'node /lib/node_modules/@anthropic-ai/claude-code/cli.js',
        ['@anthropic-ai/claude-code'],
        readFile
      )
    ).toBe('1.2.3');
  });

  it('ignores non-matching packages and binaries without scripts', () => {
    expect(
      resolveHarnessVersion(
        'node /lib/node_modules/@anthropic-ai/claude-code/cli.js',
        ['@other/pkg'],
        readFile
      )
    ).toBeUndefined();
    expect(
      resolveHarnessVersion('/usr/bin/claude', ['@anthropic-ai/claude-code'])
    ).toBeUndefined();
  });
});

describe('findHarness', () => {
  it('returns the first matching ancestor with its pid', () => {
    const match = findHarness([
      { pid: 400, ppid: 300, command: '/bin/zsh' },
      { pid: 300, ppid: 200, command: 'cursor-agent' },
      { pid: 200, ppid: 1, command: '/sbin/launchd' },
    ]);
    expect(match).toMatchObject({ name: 'cursor-cli', pid: 300 });
  });
});

describe('inspectProcessTree', () => {
  it('returns empty on unsupported platforms', async () => {
    expect(await inspectProcessTree({ platform: 'win32' })).toEqual({});
  });

  it('fails open on the current platform', async () => {
    const result = await inspectProcessTree();
    // Running under a test harness: no assertion on the match itself,
    // only that the walk terminates and never throws.
    expect(result).toBeTypeOf('object');
  });
});
