/* eslint-disable consistent-return */

const net = require('net');

function whenPortOpensCallback(port, attempts, cb) {
  const client = net.connect(port, '127.0.0.1');
  client.on('error', (error) => {
    if (!attempts) return cb(error);
    setTimeout(() => {
      whenPortOpensCallback(port, attempts - 1, cb);
    }, 50);
  });
  client.on('connect', () => {
    client.destroy();
    cb();
  });
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    whenPortOpensCallback(port, 0, (error) => {
      if (error) return resolve(false);
      resolve(true);
    });
  });
}

function whenPortOpens(port, attempts) {
  return new Promise((resolve, reject) => {
    whenPortOpensCallback(port, attempts, (error) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

module.exports = {
  isPortOpen,
  whenPortOpensCallback,
  whenPortOpens,
};
