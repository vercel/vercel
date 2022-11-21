const fs = require('fs');
const path = require('path');
const assert = require('assert');
const fetch = require('node-fetch');
const execa = require('execa');
const { spawn } = require('child_process');

const {
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

jest.setTimeout(4 * 60 * 1000);

const fixturesPath = path.resolve(__dirname, 'fixtures');

it('should match the probes against Python dev servers', async () => {
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

  const { probes } = require(path.join(fixture, 'vercel.json'));

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

const testsThatFailToBuild = new Map([
  ['30-fail-build-invalid-pipfile', 'Unable to parse Pipfile.lock'],
  [
    '31-fail-build-invalid-python36',
    'Python version "3.6" detected in Pipfile.lock is discontinued and must be upgraded.',
  ],
]);

// eslint-disable-next-line no-restricted-syntax
for (const fixture of fs.readdirSync(fixturesPath)) {
  const errMsg = testsThatFailToBuild.get(fixture);
  if (errMsg) {
    // eslint-disable-next-line no-loop-func
    it(`should fail to build ${fixture}`, async () => {
      try {
        await testDeployment(path.join(fixturesPath, fixture));
      } catch (err) {
        expect(err).toBeTruthy();
        expect(err.deployment).toBeTruthy();
        expect(err.deployment.errorMessage).toBe(errMsg);
      }
    });
    continue; //eslint-disable-line
  }
  // eslint-disable-next-line no-loop-func
  it(`should build ${fixture}`, async () => {
    await expect(
      testDeployment(path.join(fixturesPath, fixture))
    ).resolves.toBeDefined();
  });
}
