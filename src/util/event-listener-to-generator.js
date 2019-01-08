//

async function* eventListenerToGenerator(event, emitter) {
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

export default eventListenerToGenerator;
