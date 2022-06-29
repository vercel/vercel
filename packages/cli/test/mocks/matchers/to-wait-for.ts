import type { Readable } from 'stream';
import type { MatcherState } from 'expect';

export async function toWaitFor(this: MatcherState, stream: Readable, test: string) {
//export async function toWaitFor(this: MatcherState, stream: NodeJS.ReadStream, test: string) {
    let timeout = 1000;
    return new Promise((resolve) => {
      let output = '';
      let timeoutId = setTimeout(onTimeout, timeout);

      function onData(data: string) {
        //console.log({ data });
        output += data;
        if (output.includes(test)) {
          cleanup();
          resolve({
            pass: true,
            message: () => 'got it'
          });
        }
      }

      function onTimeout() {
        cleanup();
        resolve({
          pass: false,
          message: () => 'bad'
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
