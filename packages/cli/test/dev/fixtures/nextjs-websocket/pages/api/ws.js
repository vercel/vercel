const { experimental_upgradeWebSocket } = require('@vercel/functions');

module.exports = async function handler() {
  await experimental_upgradeWebSocket(ws => {
    ws.on('message', data => {
      ws.send(`echo:${data.toString()}`);
    });
  });
};
