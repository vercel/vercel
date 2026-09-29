import { PassThrough } from 'stream';
import stripAnsi from 'strip-ansi';
import ansiEscapes from 'ansi-escapes';

const ignoredAnsi = new Set([ansiEscapes.cursorHide, ansiEscapes.cursorShow]);

/**
 * In-memory TTY-like stream for tests. Records everything written to it.
 * Has no import-time side effects, so scenario tests can use it without the
 * `MockClient` harness.
 */
export class MockStream extends PassThrough implements NodeJS.WriteStream {
  isTTY: boolean;
  #_fullOutput: string = '';
  #_chunks: Array<string> = [];
  #_rawChunks: Array<string> = [];

  constructor() {
    super();
    this.isTTY = true;
  }

  override _write(
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null | undefined) => void
  ): void {
    const str = chunk.toString();

    this.#_fullOutput += str;

    // There's some ANSI Inquirer just send to keep state of the terminal clear; we'll ignore those since they're
    // unlikely to be used by end users or part of prompt code.
    if (!ignoredAnsi.has(str)) {
      this.#_rawChunks.push(str);
    }

    // Stripping the ANSI codes here because Inquirer will push commands ANSI (like cursor move.)
    // This is probably fine since we don't care about those for testing; but this could become
    // an issue if we ever want to test for those.
    if (stripAnsi(str).trim().length > 0) {
      this.#_chunks.push(str);
    }
    super._write(chunk, encoding, callback);
  }

  getLastChunk({ raw }: { raw?: boolean }): string {
    const chunks = raw ? this.#_rawChunks : this.#_chunks;
    const lastChunk = chunks[chunks.length - 1];
    return lastChunk ?? '';
  }

  getFullOutput(): string {
    return this.#_fullOutput;
  }

  // BEGIN: Stub the `WriteStream` interface to avoid TypeScript errors
  bufferSize = 0;
  bytesRead = 0;
  bytesWritten = 0;
  connecting = false;
  localAddress = '';
  localPort = 0;
  allowHalfOpen = false;
  readyState = 'readOnly' as const;
  // These are for the `ora` module
  clearLine() {
    return true;
  }
  cursorTo() {
    return true;
  }
  getColorDepth() {
    return 1;
  }
  hasColors() {
    return false;
  }
  getWindowSize(): [number, number] {
    return [80, 24];
  }
  moveCursor() {
    return false;
  }
  get columns() {
    return 80;
  }
  get rows() {
    return 24;
  }
  write(chunk: unknown, encoding?: unknown, cb?: unknown): boolean {
    return super.write(
      chunk,
      encoding as BufferEncoding | undefined,
      cb as ((error: Error | null | undefined) => void) | undefined
    );
  }
  clearScreenDown() {
    return true;
  }
  connect() {
    return this;
  }
  setTimeout() {
    return this;
  }
  setNoDelay() {
    return this;
  }
  setKeepAlive() {
    return this;
  }
  address() {
    return {};
  }
  unref() {
    return this;
  }
  ref() {
    return this;
  }
  destroySoon() {
    return;
  }
  resetAndDestroy() {
    return this;
  }
  autoSelectFamilyAttemptedAddresses: string[] = [];
  pending = false;
  // END: Stub `WriteStream` interface to avoid TypeScript errors
}
