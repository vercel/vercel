// @flow
import type { Readable } from 'stream'

async function* eventListenerToGenerator(event: string, emitter: Readable): AsyncGenerator<any, any, any> {
  while (true) {
    yield new Promise(resolve => {
      const handler = (...args) => {
        emitter.removeListener(event, handler);
        resolve(...args);
      };
      emitter.on(event, handler);
    });
  }
}

export default eventListenerToGenerator
