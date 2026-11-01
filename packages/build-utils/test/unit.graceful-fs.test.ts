import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createGracefulReadStream,
  _resetGracefulFsState,
} from '../src/graceful-fs';

// Mock the debug module
vi.mock('../src/debug', () => ({
  default: vi.fn(),
}));

/**
 * Creates a mock ReadStream that emits events in the expected order.
 * The real fs.createReadStream emits 'open' before data is available,
 * and 'error' if there's a problem opening the file.
 */
function createMockStream(shouldError: Error | null = null): fs.ReadStream {
  const stream = new EventEmitter() as fs.ReadStream;

  // Add required ReadStream properties
  Object.assign(stream, {
    path: '/mock/path',
    fd: null,
    flags: 'r',
    mode: 0o666,
    bytesRead: 0,
    pending: true,
    close: vi.fn(),
    destroy: vi.fn(),
    pipe: vi.fn(),
    read: vi.fn(),
  });

  // Schedule the event emission
  process.nextTick(() => {
    if (shouldError) {
      stream.emit('error', shouldError);
    } else {
      (stream as any).fd = 123;
      (stream as any).pending = false;
      stream.emit('open', 123);
    }
  });

  return stream;
}

describe('createGracefulReadStream', () => {
  const testFilePath = path.join(__dirname, 'fixtures', 'test-file.txt');

  beforeEach(async () => {
    // Create a test file
    await fs.promises.mkdir(path.dirname(testFilePath), { recursive: true });
    await fs.promises.writeFile(testFilePath, 'test content');
  });

  afterEach(async () => {
    // Reset the graceful-fs internal state to prevent test pollution
    _resetGracefulFsState();
    vi.restoreAllMocks();
    // Clean up test file
    try {
      await fs.promises.unlink(testFilePath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  it('should successfully create a read stream for an existing file', async () => {
    const stream = await createGracefulReadStream(testFilePath);
    expect(stream).toBeDefined();

    // Read the content to verify stream works
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const content = Buffer.concat(chunks).toString();
    expect(content).toBe('test content');
  });

  it('should reject with ENOENT for non-existent file', async () => {
    await expect(
      createGracefulReadStream('/non/existent/file.txt')
    ).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('should call onEmfileError callback when EMFILE error occurs', async () => {
    const onEmfileError = vi.fn();
    const emfileError = Object.assign(
      new Error('EMFILE: too many open files'),
      {
        code: 'EMFILE',
      }
    );

    let callCount = 0;
    vi.spyOn(fs, 'createReadStream').mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call: simulate EMFILE error
        return createMockStream(emfileError);
      }
      // Subsequent calls: succeed with real stream
      return createMockStream(null);
    });

    const stream = await createGracefulReadStream(testFilePath, onEmfileError);
    expect(stream).toBeDefined();
    expect(onEmfileError).toHaveBeenCalledTimes(1);
  });

  it('should call onEmfileError callback when ENFILE error occurs', async () => {
    const onEmfileError = vi.fn();
    const enfileError = Object.assign(
      new Error('ENFILE: file table overflow'),
      {
        code: 'ENFILE',
      }
    );

    let callCount = 0;
    vi.spyOn(fs, 'createReadStream').mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call: simulate ENFILE error
        return createMockStream(enfileError);
      }
      // Subsequent calls: succeed
      return createMockStream(null);
    });

    const stream = await createGracefulReadStream(testFilePath, onEmfileError);
    expect(stream).toBeDefined();
    expect(onEmfileError).toHaveBeenCalledTimes(1);
  });

  it('should retry and succeed after EMFILE error', async () => {
    const emfileError = Object.assign(
      new Error('EMFILE: too many open files'),
      {
        code: 'EMFILE',
      }
    );

    let callCount = 0;
    vi.spyOn(fs, 'createReadStream').mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call: simulate EMFILE error
        return createMockStream(emfileError);
      }
      // Second call: succeed
      return createMockStream(null);
    });

    const stream = await createGracefulReadStream(testFilePath);
    expect(stream).toBeDefined();
    expect(callCount).toBe(2); // First call failed, second succeeded
  });

  it('should increment emfileErrorCount multiple times for multiple EMFILE errors', async () => {
    const onEmfileError = vi.fn();
    const emfileError = Object.assign(
      new Error('EMFILE: too many open files'),
      {
        code: 'EMFILE',
      }
    );

    let callCount = 0;
    vi.spyOn(fs, 'createReadStream').mockImplementation(() => {
      callCount++;
      if (callCount <= 3) {
        // First 3 calls: simulate EMFILE error
        return createMockStream(emfileError);
      }
      // 4th call and onwards: succeed
      return createMockStream(null);
    });

    const stream = await createGracefulReadStream(testFilePath, onEmfileError);
    expect(stream).toBeDefined();
    expect(onEmfileError).toHaveBeenCalledTimes(3);
    expect(callCount).toBe(4);
  });

  it('should not call onEmfileError for non-EMFILE errors', async () => {
    const onEmfileError = vi.fn();
    const eaccesError = Object.assign(new Error('EACCES: permission denied'), {
      code: 'EACCES',
    });

    vi.spyOn(fs, 'createReadStream').mockImplementation(() => {
      return createMockStream(eaccesError);
    });

    await expect(
      createGracefulReadStream(testFilePath, onEmfileError)
    ).rejects.toMatchObject({
      code: 'EACCES',
    });

    expect(onEmfileError).not.toHaveBeenCalled();
  });
});
