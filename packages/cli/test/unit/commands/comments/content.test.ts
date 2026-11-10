import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { readAllStandardInput } from '../../../../src/commands/comments/content';

describe('readAllStandardInput', () => {
  it('reads multi-chunk piped input to EOF without truncation', async () => {
    const stdin = new PassThrough();
    const promise = readAllStandardInput(stdin);
    stdin.write('first chunk\n');
    setTimeout(() => {
      stdin.write('second chunk arriving later\n');
      stdin.end();
    }, 50);

    await expect(promise).resolves.toBe(
      'first chunk\nsecond chunk arriving later\n'
    );
  });

  it('resolves empty after the no-data window when nothing is piped', async () => {
    const stdin = new PassThrough();
    await expect(readAllStandardInput(stdin)).resolves.toBe('');
  });

  it('resolves empty immediately on a TTY', async () => {
    await expect(
      readAllStandardInput({
        isTTY: true,
        setEncoding: () => {},
        on: () => {},
        off: () => {},
      })
    ).resolves.toBe('');
  });
});
