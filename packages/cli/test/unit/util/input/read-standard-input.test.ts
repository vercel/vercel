import { describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import readStandardInput from '../../../../src/util/input/read-standard-input';

function createMockStdin({ isTTY = false }: { isTTY?: boolean } = {}) {
  const stream = new PassThrough() as PassThrough & { isTTY: boolean };
  stream.isTTY = isTTY;
  return stream;
}

describe('readStandardInput', () => {
  it('returns empty string for TTY stdin', async () => {
    const stdin = createMockStdin({ isTTY: true });
    const result = await readStandardInput(stdin as any);
    expect(result).toBe('');
  });

  it('returns empty string when no data arrives within timeout', async () => {
    const stdin = createMockStdin();
    const result = await readStandardInput(stdin as any);
    expect(result).toBe('');
  }, 2000);

  it('reads single-line input', async () => {
    const stdin = createMockStdin();
    const promise = readStandardInput(stdin as any);
    stdin.end('hello world\n');
    const result = await promise;
    expect(result).toBe('hello world\n');
  });

  it('reads multiline input from a single chunk', async () => {
    const stdin = createMockStdin();
    const promise = readStandardInput(stdin as any);
    const multiline =
      '-----BEGIN PRIVATE KEY-----\nMIIEvQIBA...\n-----END PRIVATE KEY-----\n';
    stdin.end(multiline);
    const result = await promise;
    expect(result).toBe(multiline);
  });

  it('reads multiline input split across multiple chunks', async () => {
    const stdin = createMockStdin();
    const promise = readStandardInput(stdin as any);
    stdin.write('line1\n');
    stdin.write('line2\n');
    stdin.write('line3\n');
    stdin.end();
    const result = await promise;
    expect(result).toBe('line1\nline2\nline3\n');
  });
});
