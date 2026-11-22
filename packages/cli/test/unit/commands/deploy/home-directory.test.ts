import { afterEach, describe, expect, it, vi } from 'vitest';
import { homedir } from 'node:os';
import deploy from '../../../../src/commands/deploy';
import { client } from '../../../mocks/client';

describe('deploy home-directory confirmation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['deploy'],
    ['deploy', homedir()],
    ['deploy', '--yes'],
    ['deploy', 'init'],
    ['deploy', 'continue', '--deployment', 'dpl_test'],
  ])('rejects non-interactive %j before any requests', async (...args) => {
    client.cwd = homedir();
    client.setArgv(...args);
    client.nonInteractive = true;
    client.isAgent = true;
    client.agentName = 'v0';
    client.stdin.isTTY = false;
    const confirm = vi.spyOn(client.input, 'confirm');
    const fetch = vi.spyOn(client, 'fetch');
    vi.spyOn(process, 'exit').mockImplementation(code => {
      throw new Error(`process.exit(${code})`);
    });

    await expect(deploy(client)).rejects.toThrow('process.exit(2)');
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'action_required',
      reason: 'interactive_confirmation_required',
      message: expect.stringContaining("Can't deploy your home directory"),
      userActionRequired: true,
    });
    expect(client.stderr.getFullOutput()).toBe('');
    expect(confirm).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects non-TTY stdin without an agent before any requests', async () => {
    client.cwd = homedir();
    client.setArgv('deploy');
    client.stdin.isTTY = false;
    const confirm = vi.spyOn(client.input, 'confirm');
    const fetch = vi.spyOn(client, 'fetch');

    await expect(deploy(client)).resolves.toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      "Can't deploy your home directory without interactive confirmation."
    );
    expect(client.stderr.getFullOutput()).not.toContain(
      'Do you want to continue?'
    );
    expect(client.stdout.getFullOutput()).toBe('');
    expect(confirm).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
