'use strict';

// Test-only preload for hermetic CLI scenario subprocesses.
//
// It permits TCP connections only to the scenario's fake API port on a
// loopback address and blocks nested processes, UDP sockets, and non-loopback
// DNS lookups. Every blocked attempt is appended to a parent-owned log so a CLI
// catch/fallback path cannot hide it.

const fs = require('node:fs');
const net = require('node:net');
const dns = require('node:dns');
const dgram = require('node:dgram');
const childProcess = require('node:child_process');
const { syncBuiltinESMExports } = require('node:module');

const logPath = process.env.VERCEL_SCENARIO_GUARD_LOG;
const allowedPort = Number(process.env.VERCEL_SCENARIO_GUARD_PORT);

if (!logPath || !Number.isInteger(allowedPort) || allowedPort <= 0) {
  throw new Error('[scenario guard] missing guard log or allowed port');
}

const appendFileSync = fs.appendFileSync;
const loopbackHosts = new Set(['127.0.0.1', '::1', 'localhost']);

function deny(kind, target) {
  appendFileSync(logPath, `${JSON.stringify({ kind, target })}\n`);
  const error = new Error(`[scenario guard] blocked ${kind}: ${target}`);
  error.code = 'ERR_SCENARIO_GUARD';
  return error;
}

function connectionTarget(args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];

  if (first !== null && typeof first === 'object') {
    if (first.path !== undefined) {
      return { path: String(first.path) };
    }
    return { host: first.host ?? 'localhost', port: Number(first.port) };
  }

  if (typeof first === 'string' && !/^\d+$/.test(first)) {
    return { path: first };
  }

  return {
    host: typeof args[1] === 'string' ? args[1] : 'localhost',
    port: Number(first),
  };
}

const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function scenarioGuardConnect(...args) {
  const target = connectionTarget(args);
  if (
    target.path === undefined &&
    loopbackHosts.has(target.host) &&
    target.port === allowedPort
  ) {
    return originalConnect.apply(this, args);
  }

  throw deny('socket', target.path ?? `${target.host}:${target.port}`);
};

const originalLookup = dns.lookup;
dns.lookup = function scenarioGuardLookup(hostname, ...args) {
  if (loopbackHosts.has(hostname)) {
    return originalLookup.call(this, hostname, ...args);
  }
  throw deny('dns', String(hostname));
};

const originalPromisesLookup = dns.promises.lookup;
dns.promises.lookup = function scenarioGuardPromisesLookup(hostname, ...args) {
  if (loopbackHosts.has(hostname)) {
    return originalPromisesLookup.call(this, hostname, ...args);
  }
  return Promise.reject(deny('dns', String(hostname)));
};

dgram.createSocket = function scenarioGuardCreateSocket(type) {
  throw deny('udp', String(type?.type ?? type));
};

for (const name of [
  'spawn',
  'spawnSync',
  'exec',
  'execSync',
  'execFile',
  'execFileSync',
  'fork',
]) {
  childProcess[name] = function scenarioGuardChildProcess(command) {
    throw deny('child_process', `${name} ${String(command)}`);
  };
}

childProcess.ChildProcess.prototype.spawn = function scenarioGuardSpawn(
  options
) {
  throw deny('child_process', `ChildProcess ${String(options?.file)}`);
};

// ESM named imports of built-ins are snapshots until explicitly synchronized.
syncBuiltinESMExports();
