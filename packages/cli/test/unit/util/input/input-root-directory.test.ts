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
    expect(client.stderr.getFullOutput()).not.toContain(
      'In which directory is your code located?'
    );
  });

  it('prompts and returns null when the user submits empty input', async () => {
    const resultPromise = inputRootDirectory(client, '/tmp', false);

    await expect(client.stderr).toOutput(
      'In which directory is your code located?'
    );
    client.stdin.write('\n');

    await expect(resultPromise).resolves.toBeNull();
  });
});
