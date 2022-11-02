const { createServer } = require('net');
const { Server } = require('http');
const { Socket } = require('net');
const { URL } = require('url');
const crypto = require('crypto');
const listen = require('test-listen');

exports.runServer = async function runServer({ handler }) {
  const server = new Server(handler);
  const url = await listen(server);
  return { url: new URL(url), close: getKillServer(server) };
};

function getKillServer(server) {
  let sockets = [];

  server.on('connection', socket => {
    sockets.push(socket);
    socket.once('close', () => {
      sockets.splice(sockets.indexOf(socket), 1);
    });
  });

  return () => {
    return new Promise((resolve, reject) => {
      server.close(err => {
        if (err) {
          return reject(err);
        }
        resolve();
      });

      sockets.forEach(function (socket) {
        socket.destroy();
      });

      sockets = [];
    });
  };
}

exports.runTcpServer = async function runTcpServer({
  effects,
  httpServer,
  cipherParams,
}) {
  const server = createServer();
  server.on('connection', connection => {
    const socket = new Socket();
    socket.connect(parseInt(httpServer.url.port, 10), httpServer.hostname);
    const decipher = crypto.createDecipheriv(
      cipherParams.cipher,
      cipherParams.cipherKey,
      cipherParams.cipherIV
    );

    decipher.pipe(socket);

    const CRLF = Buffer.from('\r\n');
    let accBuffer = Buffer.from([]);
    connection.on('data', function onConnectionData(chunk) {
      accBuffer = Buffer.concat([accBuffer, chunk]);
      const idx = accBuffer.indexOf(CRLF);
      if (idx !== -1) {
        effects.callbackStream = accBuffer.slice(0, idx).toString();
        connection.off('data', onConnectionData);
        decipher.write(accBuffer.slice(idx + 2));
        connection.pipe(decipher);
        decipher.on('close', () => {
          socket.end();
        });
      }
    });
  });

  const url = await listen(server);
  return { url: new URL(url), close: getKillServer(server) };
};
