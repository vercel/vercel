// Preloaded only by benchmarks. Any network attempt fails the entire run,
// even when production code catches the exception.
const net = require('node:net');
const tls = require('node:tls');
const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns');
const { syncBuiltinESMExports } = require('node:module');
let attempts = 0;
if (process.env.BENCHMARK_REPORT_RUNTIME === '1') {
  let sea = false;
  try {
    sea = require('node:sea').isSea();
  } catch {
    // Older supported Node versions do not expose node:sea.
  }
  process.stderr.write(
    `BENCHMARK_RUNTIME=${JSON.stringify({ node: process.version, sea })}\n`
  );
}
function blocked() {
  attempts++;
  throw new Error('BENCHMARK_NETWORK_FORBIDDEN');
}
net.Socket.prototype.connect = blocked;
net.connect = net.createConnection = tls.connect = blocked;
http.request = http.get = https.request = https.get = blocked;
dns.lookup = dns.resolve = blocked;
dns.promises.lookup = dns.promises.resolve = blocked;
globalThis.fetch = blocked;
syncBuiltinESMExports();
process.on('exit', () => {
  process.stderr.write(`BENCHMARK_NETWORK_ATTEMPTS=${attempts}\n`);
  if (attempts) process.exitCode = 99;
});
module.exports = { blocked };
