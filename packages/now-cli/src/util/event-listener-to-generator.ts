import { EventEmitter } from 'events';

async function* eventListenerToGenerator(event: string, emitter: EventEmitter) {
  while (true) {
    yield new Promise(resolve => {
      const handler = (...args: any[]) => {
        emitter.removeListener(event, handler);
        resolve(...args);
      };
      emitter.on(event, handler);
    });
  }
}

export default eventListenerToGenerator;
