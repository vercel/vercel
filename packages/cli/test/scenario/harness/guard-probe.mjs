// Controlled probe for the scenario guard self-test.
import { spawnSync } from 'node:child_process';
import childProcess from 'node:child_process';
import net from 'node:net';
import tls from 'node:tls';

const allowedPort = Number(process.env.VERCEL_SCENARIO_GUARD_PORT);

function attempt(action) {
  try {
    action();
    return 'allowed';
  } catch (error) {
    return error.code ?? String(error);
  }
}

async function attemptAsync(action) {
  try {
    await action();
    return 'allowed';
  } catch (error) {
    return error.cause?.code ?? error.code ?? String(error);
  }
}

const results = {
  netConnect: attempt(() => net.connect(443, '203.0.113.1')),
  tlsConnect: attempt(() => tls.connect(443, 'example.com')),
  fetch: await attemptAsync(() => fetch('https://example.com/')),
  namedSpawnSync: attempt(() => spawnSync(process.execPath, ['--version'])),
  execSync: attempt(() => childProcess.execSync('git --version')),
  allowedFetch: await fetch(`http://127.0.0.1:${allowedPort}/ok`).then(res =>
    res.text()
  ),
};

process.stdout.write(JSON.stringify(results));
