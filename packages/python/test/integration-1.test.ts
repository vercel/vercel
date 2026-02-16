require('./integration-setup')(1);

// NOTE: The fixture `00-request-path` has special case handling for local dev support below

const assert = require('assert');
const execa = require('execa');
const { spawn } = require('child_process');
const path = require('path');

const fixturesPath = path.resolve(__dirname, 'fixtures');

// https://linear.app/vercel/issue/ZERO-3044/fix-python-on-github-actions
// eslint-disable-next-line jest/no-disabled-tests
it.skip('should match the probes against Python dev servers', async () => {
  const fixture = path.join(fixturesPath, '00-request-path');

  await execa(
    'pip3',
    ['install', '--user', '--upgrade', 'setuptools', 'wheel'],
    {
      cwd: fixture,
      stdio: 'inherit',
    }
  );
  await execa('pip3', ['install', '--user', '-r', 'requirements.txt'], {
    cwd: fixture,
    stdio: 'inherit',
  });

  const ports = new Map();
  ports.set('/api/python.py', 8001);
  ports.set('/api/wsgi.py', 8002);
  ports.set('/api/asgi.py', 8003);

  const { probes } = require(path.join(fixture, 'probes.json'));

  const pythonServer = spawn('python3', ['api/python.py'], {
    cwd: fixture,
    stdio: 'inherit',
  });

  const wsgiServer = spawn('python3', ['api/wsgi.py'], {
    cwd: fixture,
    stdio: 'inherit',
  });

  const asgiServer = spawn('python3', ['api/asgi.py'], {
    cwd: fixture,
    stdio: 'inherit',
  });

  try {
    // wait a few seconds for the dev servers to boot-up
    await new Promise(r => setTimeout(r, 3000));

    for (const { path, mustContain } of probes) {
      const port = ports.get(path.substring(0, path.indexOf('?')));
      const res = await fetch(`http://localhost:${port}${path}`);
      const body = await res.text();
      assert(
        body.includes(mustContain),
        `Expected to contain "${mustContain}" but got "${body}"`
      );
    }
  } finally {
    process.kill(pythonServer.pid);
    process.kill(wsgiServer.pid);
    process.kill(asgiServer.pid);
  }
});
