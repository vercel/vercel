import type { Readable } from 'stream';
import type { MatcherState } from '@vitest/expect';
import stripAnsi from 'strip-ansi';

export interface ToOutputMatchers<R = unknown> {
  toOutput: (test: string, timeout?: number) => Promise<R>;
}

export async function toOutput(
  this: MatcherState,
  stream: Readable,
  test: string,
  timeout = 3000
): Promise<{
  pass: boolean;
  message: () => string;
}> {
  const { isNot } = this;
  return new Promise(resolve => {
    let output = '';
    const timeoutId = setTimeout(onTimeout, timeout);
    const hint = `expect(stream)${isNot ? '.not' : ''}.toOutput(test)\n\n`;

    function onData(data: string) {
      output += stripAnsi(data);
      if (output.includes(test)) {
        cleanup();
        resolve({
          pass: true,
          message() {
            return (
              hint +
              `Expected output: ${isNot ? 'not ' : ''}${JSON.stringify(test)}` +
              '\n' +
              `Received output: ${JSON.stringify(output)}`
            );
          },
        });
      }
    }

    function onTimeout() {
      cleanup();
      resolve({
        pass: false,
        message() {
          return `${hint}Timed out waiting ${timeout} ms for output.\n\nExpected: "${test}"\nReceived: "${output}"`;
        },
      });
    }

    function cleanup() {
      clearTimeout(timeoutId);
      stream.removeListener('data', onData);
      stream.pause();
    }

    stream.on('data', onData);
    stream.resume();
  });
}
