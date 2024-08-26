import {
  getLabelPrinter,
  matcherHint,
  printExpected,
  printReceived,
} from 'jest-matcher-utils';
import type { Readable } from 'stream';
import type { MatcherState } from '@vitest/expect';
import type { MatcherHintOptions } from 'jest-matcher-utils';
import stripAnsi from 'strip-ansi';

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
  const matcherName = 'toOutput';
  const matcherHintOptions: MatcherHintOptions = {
    isNot,
    promise: this.promise,
  };
  return new Promise(resolve => {
    let output = '';
    let timeoutId = setTimeout(onTimeout, timeout);
    const hint =
      matcherHint(matcherName, 'stream', 'test', matcherHintOptions) + '\n\n';

    function onData(data: string) {
      output += stripAnsi(data);
      if (output.includes(test)) {
        cleanup();
        resolve({
          pass: true,
          message() {
            const labelExpected = 'Expected output';
            const labelReceived = 'Received output';
            const printLabel = getLabelPrinter(labelExpected, labelReceived);
            return (
              hint +
              printLabel(labelExpected) +
              (isNot ? 'not ' : '') +
              printExpected(test) +
              '\n' +
              printLabel(labelReceived) +
              (isNot ? '    ' : '') +
              printReceived(output)
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
