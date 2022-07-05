import {
  getLabelPrinter,
  matcherHint,
  printExpected,
  printReceived,
} from 'jest-matcher-utils';
import type { Readable } from 'stream';
import type { MatcherState } from 'expect';
import type { MatcherHintOptions } from 'jest-matcher-utils';

export async function toOutput(
  this: MatcherState,
  stream: Readable,
  test: string,
  timeout = 3000
) {
  const { isNot } = this;
  const matcherName = 'toOutput';
  const matcherHintOptions: MatcherHintOptions = {
    isNot,
    promise: this.promise,
  };
  return new Promise(resolve => {
    let output = '';
    let timeoutId = setTimeout(onTimeout, timeout);

    const message = () => {
      const labelExpected = 'Expected output';
      const labelReceived = 'Received output';
      const printLabel = getLabelPrinter(labelExpected, labelReceived);
      const hint =
        matcherHint(matcherName, 'stream', 'test', matcherHintOptions) + '\n\n';
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
    };

    function onData(data: string) {
      output += data;
      if (output.includes(test)) {
        cleanup();
        resolve({ pass: true, message });
      }
    }

    function onTimeout() {
      cleanup();
      resolve({ pass: false, message });
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
