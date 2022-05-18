'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const net = require('net');
const os = require('os');
const fsMemo = require('fs-memo');

const unsafePorts = /* @__PURE__ */ new Set([
  1,
  7,
  9,
  11,
  13,
  15,
  17,
  19,
  20,
  21,
  22,
  23,
  25,
  37,
  42,
  43,
  53,
  69,
  77,
  79,
  87,
  95,
  101,
  102,
  103,
  104,
  109,
  110,
  111,
  113,
  115,
  117,
  119,
  123,
  135,
  137,
  139,
  143,
  161,
  179,
  389,
  427,
  465,
  512,
  513,
  514,
  515,
  526,
  530,
  531,
  532,
  540,
  548,
  554,
  556,
  563,
  587,
  601,
  636,
  989,
  990,
  993,
  995,
  1719,
  1720,
  1723,
  2049,
  3659,
  4045,
  5060,
  5061,
  6e3,
  6566,
  6665,
  6666,
  6667,
  6668,
  6669,
  6697,
  10080
]);
function isUnsafePort(port) {
  return unsafePorts.has(port);
}
function isSafePort(port) {
  return !isUnsafePort(port);
}

async function getPort(config) {
  if (typeof config === "number" || typeof config === "string") {
    config = { port: parseInt(config + "") };
  }
  const options = {
    name: "default",
    random: false,
    port: parseInt(process.env.PORT || "") || 3e3,
    ports: [],
    portRange: [3e3, 3100],
    host: void 0,
    memoName: "port",
    ...config
  };
  if (options.random) {
    return getRandomPort(options.host);
  }
  const portsToCheck = [
    options.port,
    ...options.ports,
    ...generateRange(options.portRange[0], options.portRange[1])
  ].filter((port) => port && isSafePort(port));
  const memoOptions = { name: options.memoName, dir: options.memoDir };
  const memoKey = "port_" + options.name;
  const memo = await fsMemo.getMemo(memoOptions);
  if (memo[memoKey]) {
    portsToCheck.push(memo[memoKey]);
  }
  const availablePort = await findPort(portsToCheck, options.host);
  await fsMemo.setMemo({ [memoKey]: availablePort }, memoOptions);
  return availablePort;
}
async function getRandomPort(host) {
  const port = await checkPort(0, host);
  if (port === false) {
    throw new Error("Unable to obtain an available random port number!");
  }
  return port;
}
async function waitForPort(port, opts = {}) {
  const delay = opts.delay || 500;
  const retries = opts.retries || 4;
  for (let i = retries; i > 0; i--) {
    if (await checkPort(port, opts.host) === false) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error(`Timeout waiting for port ${port} after ${retries} retries with ${delay}ms interval.`);
}
async function checkPort(port, host = process.env.HOST) {
  if (!host) {
    host = getLocalHosts([void 0, "0.0.0.0"]);
  }
  if (!Array.isArray(host)) {
    return _checkPort(port, host);
  }
  for (const _host of host) {
    const _port = await _checkPort(port, _host);
    if (_port === false) {
      return false;
    }
    if (port === 0 && _port !== 0) {
      port = _port;
    }
  }
  return port;
}
function generateRange(from, to) {
  if (to < from) {
    return [];
  }
  const r = [];
  for (let i = from; i < to; i++) {
    r.push(i);
  }
  return r;
}
function _checkPort(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", (err) => {
      if (err.code === "EINVAL" || err.code === "EADDRNOTAVAIL") {
        resolve(port !== 0 && isSafePort(port) && port);
      } else {
        resolve(false);
      }
    });
    server.listen({ port, host }, () => {
      const { port: port2 } = server.address();
      server.close(() => {
        resolve(isSafePort(port2) && port2);
      });
    });
  });
}
function getLocalHosts(additional) {
  const hosts = new Set(additional);
  for (const _interface of Object.values(os.networkInterfaces())) {
    for (const config of _interface) {
      hosts.add(config.address);
    }
  }
  return Array.from(hosts);
}
async function findPort(ports, host) {
  for (const port of ports) {
    const r = await checkPort(port, host);
    if (r) {
      return r;
    }
  }
  return getRandomPort(host);
}

exports.checkPort = checkPort;
exports.getPort = getPort;
exports.getRandomPort = getRandomPort;
exports.isSafePort = isSafePort;
exports.isUnsafePort = isUnsafePort;
exports.waitForPort = waitForPort;
