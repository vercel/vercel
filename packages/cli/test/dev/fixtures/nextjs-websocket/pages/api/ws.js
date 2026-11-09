const { upgradeWebSocket } = require('@vercel/functions');

module.exports = async function handler() {
  await upgradeWebSocket(ws => {
    ws.on('message', data => {
      ws.send(`echo:${data.toString()}`);
    });
  });
};
