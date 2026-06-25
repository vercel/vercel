const assert = require('assert');
const WebSocket = require('ws');

/**
 * Verify the flask-sock WebSocket endpoint over a real upgraded connection:
 * the handshake must return 101 and the server must echo messages back. This
 * exercises the WSGI WebSocket support in the Python runtime end-to-end.
 */
module.exports = async ({ deploymentUrl }) => {
  const wsUrl = `wss://${deploymentUrl}/ws`;
  const sent = ['hello', 'world'];
  const expected = ['echo:hello', 'echo:world'];

  const result = await new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const received = [];
    let index = 0;
    let upgradeStatus = 0;

    const timer = setTimeout(() => {
      try {
        socket.terminate();
      } catch (_) {
        // ignore
      }
      reject(
        new Error(
          `WebSocket timed out for ${wsUrl} (upgrade status ${upgradeStatus}, received ${JSON.stringify(received)})`
        )
      );
    }, 20000);

    socket.on('upgrade', res => {
      upgradeStatus = res.statusCode;
    });
    socket.on('open', () => socket.send(sent[index]));
    socket.on('message', data => {
      received.push(data.toString());
      index += 1;
      if (index < sent.length) {
        socket.send(sent[index]);
      } else {
        socket.close();
      }
    });
    socket.on('close', () => {
      clearTimeout(timer);
      resolve({ received, upgradeStatus });
    });
    socket.on('unexpected-response', (_req, res) => {
      clearTimeout(timer);
      reject(
        new Error(
          `WebSocket upgrade failed for ${wsUrl}: HTTP ${res.statusCode}`
        )
      );
    });
    socket.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });

  assert.strictEqual(
    result.upgradeStatus,
    101,
    `Expected 101 Switching Protocols from ${wsUrl}, got ${result.upgradeStatus}`
  );
  assert.deepStrictEqual(
    result.received,
    expected,
    `Unexpected echo from ${wsUrl}: ${JSON.stringify(result.received)}`
  );
  console.log('WebSocket echo probe passed:', JSON.stringify(result.received));
};
