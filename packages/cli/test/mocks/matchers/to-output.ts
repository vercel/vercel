import type { Readable } from 'stream';
import type { MatcherState } from 'expect';

export async function toOutput(
  this: MatcherState,
  stream: Readable,
  test: string
) {
  let timeout = 1000;
  return new Promise(resolve => {
    let output = '';
    let timeoutId = setTimeout(onTimeout, timeout);

    function onData(data: string) {
      output += data;
      if (output.includes(test)) {
        cleanup();
        resolve({
          pass: true,
          message: () => 'got it',
        });
      }
    }

    function onTimeout() {
      cleanup();
      resolve({
        pass: false,
        message: () => 'bad',
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
