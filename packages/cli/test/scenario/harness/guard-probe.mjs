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

if (process.argv[2] === 'routed') {
  const text = async url => (await fetch(url)).text();
  const request = new Request('https://vercel.com/ok?via=request');
  process.stdout.write(
    JSON.stringify({
      api: await text('https://api.vercel.com/ok'),
      issuer: await text(new URL('https://vercel.com/ok')),
      request: await text(request),
      other: await attemptAsync(() => fetch('https://example.com/')),
    })
  );
  process.exit(0);
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
