const assert = require('assert');

module.exports = async ({ deploymentUrl, fetch }) => {
  const pageUrl = `https://${deploymentUrl}/`;
  const response = await fetch(pageUrl);
  const body = await response.text();

  assert.strictEqual(response.status, 200);
  assert(
    body.includes(`new WebSocket("wss://${deploymentUrl}/echo")`),
    `Expected ${pageUrl} to render a secure WebSocket URL`
  );

  await testEcho(`wss://${deploymentUrl}/echo`);
};

async function testEcho(url) {
  const messages = ['Hello world!', 'Still connected'];

  assert.strictEqual(
    typeof globalThis.WebSocket,
    'function',
    'The WebSocket probe requires Node.js 22 or newer'
  );

  await new Promise((resolve, reject) => {
    const socket = new globalThis.WebSocket(url);
    let messageIndex = 0;
    let settled = false;
    const timeout = setTimeout(
      () => finish(new Error(`Timed out waiting for WebSocket echo from ${url}`)),
      20_000
    );

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) {
        socket.close();
        reject(error);
      } else {
        resolve();
      }
    }

    socket.addEventListener('open', () => socket.send(messages[messageIndex]));
    socket.addEventListener('message', event => {
      try {
        assert.strictEqual(event.data, messages[messageIndex]);
        messageIndex++;
        if (messageIndex === messages.length) {
          socket.close(1000);
          return;
        }
        socket.send(messages[messageIndex]);
      } catch (error) {
        finish(error);
      }
    });
    socket.addEventListener('error', () => {
      finish(new Error(`WebSocket connection failed for ${url}`));
    });
    socket.addEventListener('close', () => {
      if (messageIndex < messages.length) {
        finish(
          new Error(
            `WebSocket closed after ${messageIndex} of ${messages.length} echoes`
          )
        );
        return;
      }
      finish();
    });
  });
}
