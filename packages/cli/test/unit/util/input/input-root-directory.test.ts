import { describe, beforeEach, expect, it, vi } from 'vitest';
import { inputRootDirectory } from '../../../../src/util/input/input-root-directory';
import { client } from '../../../mocks/client';

describe('inputRootDirectory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null without prompting when autoConfirm is true', async () => {
    const result = await inputRootDirectory(client, '/tmp', true);
    expect(result).toBeNull();
    expect(client.stderr.getFullOutput()).not.toContain('Code directory?');
  });

  it('prompts and returns null when the current directory is selected', async () => {
    const resultPromise = inputRootDirectory(client, '/tmp', false);

    // Wait for the choice list, not just the message: the search prompt
    // ignores Enter until its source has resolved. Submit with `\r`, since
    // `@inquirer/search` only treats a carriage return as an enter key.
    await expect(client.stderr).toOutput('Use this directory');
    client.stdin.write('\r');

    await expect(resultPromise).resolves.toBeNull();
  });
});
