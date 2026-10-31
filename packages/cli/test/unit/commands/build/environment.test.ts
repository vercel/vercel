import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWriteableDirectory } from '@vercel/build-utils';
import build from '../../../../src/commands/build';
import { client } from '../../../mocks/client';

describe('build --environment', () => {
  beforeEach(async () => {
    delete process.env.__VERCEL_BUILD_RUNNING;
    client.cwd = await getWriteableDirectory();
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('unexpected exit');
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function nextCommands(): string[] {
    const payload = JSON.parse(client.stdout.getFullOutput());
    return payload.next.map((next: { command: string }) => next.command);
  }

  it.each([
    [['--environment', 'staging']],
    [['-e', 'staging']],
  ])('suggests commands for the environment given with %j', async args => {
    client.nonInteractive = true;
    client.setArgv('build', ...args);
    expect(await build(client)).toBe(1);
    const commands = nextCommands();
    expect(commands).toContainEqual(
      expect.stringContaining('pull --yes --environment staging')
    );
    expect(commands).toContainEqual(
      expect.stringContaining('build --yes --environment staging')
    );
    expect(commands.join('\n')).not.toContain('--target');
    expect(client.stderr.getFullOutput()).not.toContain('deprecated');
  });

  it('keeps --target working with a deprecation warning', async () => {
    client.nonInteractive = true;
    client.setArgv('build', '--target', 'staging');
    expect(await build(client)).toBe(1);
    expect(nextCommands()).toContainEqual(
      expect.stringContaining('build --yes --environment staging')
    );
    expect(client.stderr.getFullOutput()).toContain(
      '--target is deprecated. Use --environment.'
    );
  });

  it('rejects --target together with --environment before doing any work', async () => {
    client.setArgv('build', '--target', 'staging', '--environment', 'preview');
    expect(await build(client)).toBe(2);
    expect(client.stdout.getFullOutput()).toBe('');
    expect(client.stderr.getFullOutput()).toContain(
      "Can't use --target with --environment. Use --environment."
    );
  });
});
