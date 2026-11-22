import stripAnsi from 'strip-ansi';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../mocks/client';
import tokenPass from '../../../src/commands/token-pass';
import codingAgentsSetup from '../../../src/commands/ai-gateway/coding-agents-setup';
import { commands } from '../../../src/commands';
import {
  printCommandHelp,
  printGroupHelp,
} from '../../../src/commands/print-command-help';

vi.mock('../../../src/commands/ai-gateway/coding-agents-setup', () => ({
  default: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(codingAgentsSetup).mockReset().mockResolvedValue(0);
});

describe('token-pass', () => {
  it.each([
    ['token-pass'],
    ['tokenpass'],
    ['token-pass', 'setup'],
    ['tokenpass', 'setup'],
  ])('forwards %j to Token Pass setup', async (...path) => {
    client.setArgv(
      ...path,
      '--agent',
      'opencode',
      '--yes',
      '--dry-run',
      '--name',
      'my pass'
    );
    const original = [...client.argv];
    let delegatedArgv: string[] = [];
    vi.mocked(codingAgentsSetup).mockImplementation(async target => {
      delegatedArgv = [...target.argv];
      return 0;
    });

    expect(await tokenPass(client)).toBe(0);
    const flags = [
      '--token-pass',
      '--agent',
      'opencode',
      '--yes',
      '--dry-run',
      '--name',
      'my pass',
    ];
    expect(codingAgentsSetup).toHaveBeenCalledExactlyOnceWith(client, flags);
    expect(delegatedArgv.slice(2)).toEqual([
      'ai-gateway',
      'coding-agents',
      'setup',
      ...flags,
    ]);
    expect(client.argv).toEqual(original);
    expect(commands.get(path[0])).toBe('token-pass');
  });

  it('forwards globals before and after the alias', async () => {
    client.setArgv(
      '--scope',
      'acme',
      'token-pass',
      'setup',
      '--agent=opencode',
      '--non-interactive',
      '--cwd',
      '/tmp/project'
    );
    expect(await tokenPass(client)).toBe(0);
    expect(codingAgentsSetup).toHaveBeenCalledWith(client, [
      '--scope',
      'acme',
      '--token-pass',
      '--agent=opencode',
      '--non-interactive',
      '--cwd',
      '/tmp/project',
    ]);
  });

  it('preserves a -- separator and its following tokens', async () => {
    client.setArgv(
      'token-pass',
      'setup',
      '--agent',
      'opencode',
      '--',
      '--dry-run'
    );
    expect(await tokenPass(client)).toBe(0);
    expect(codingAgentsSetup).toHaveBeenCalledWith(client, [
      '--token-pass',
      '--agent',
      'opencode',
      '--',
      '--dry-run',
    ]);
  });

  it.each([1, 2])('passes through exit code %s', async code => {
    client.setArgv('token-pass');
    vi.mocked(codingAgentsSetup).mockResolvedValue(code);
    expect(await tokenPass(client)).toBe(code);
  });

  it('restores argv if setup throws', async () => {
    client.setArgv('token-pass', '--agent', 'opencode');
    const original = [...client.argv];
    vi.mocked(codingAgentsSetup).mockRejectedValue(new Error('setup failed'));
    await expect(tokenPass(client)).rejects.toThrow('setup failed');
    expect(client.argv).toEqual(original);
  });

  it.each([
    'token-pass',
    'tokenpass',
  ])('runs %s without a subcommand', command => {
    expect(printGroupHelp(client, command, [])).toBeUndefined();
  });

  it.each([
    { command: 'token-pass', tokens: ['--help'] },
    { command: 'tokenpass', tokens: ['--help'] },
    { command: 'token-pass', tokens: ['setup', '--help'] },
    { command: 'tokenpass', tokens: ['setup', '--help'] },
  ])('renders offline help for $command $tokens', ({ command, tokens }) => {
    const fetchSpy = vi.spyOn(client, 'fetch');
    fetchSpy.mockClear();
    expect(printCommandHelp(client, command, tokens)).toBe(0);
    const text = stripAnsi(client.stdout.getFullOutput());
    expect(text.replace(/\s+/g, ' ')).toContain(
      'Set up a coding agent with Vercel Token Pass'
    );
    expect(text).toContain('--agent');
    expect(text).toContain('--dry-run');
    expect(text).not.toContain('alias for');
    expect(text.replace(/[ \t]+$/gm, '')).toMatchSnapshot();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(codingAgentsSetup).not.toHaveBeenCalled();
  });
});
