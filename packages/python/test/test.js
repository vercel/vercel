const fs = require('fs');
const path = require('path');
const assert = require('assert');
const fetch = require('node-fetch');
const execa = require('execa');
const { spawn } = require('child_process');

const {
  packAndDeploy,
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

jest.setTimeout(4 * 60 * 1000);
const buildUtilsUrl = '@canary';
let builderUrl;

beforeAll(async () => {
  const builderPath = path.resolve(__dirname, '..');
  builderUrl = await packAndDeploy(builderPath);
  console.log('builderUrl', builderUrl);
});

const fixturesPath = path.resolve(__dirname, 'fixtures');

it('should match the probes against Python dev servers', async () => {
  const fixture = path.join(fixturesPath, '00-request-path');

  //const builder = require('../dist');
  //await builder.build({ workPath: fixture, entrypoint: 'api/python.py', files: {} });

  const requirements = `aiofiles==0.8.0; python_version >= "3.6" and python_version < "4.0"
  certifi==2021.10.8
  click==8.1.2; python_version >= "3.7"
  flask==2.1.1
  h11==0.9.0
  httpcore==0.11.1; python_version >= "3.6"
  httptools==0.4.0; python_version >= "3.5"
  httpx==0.15.4; python_version >= "3.6"
  idna==3.3
  importlib-metadata==4.11.3; python_version < "3.10"
  itsdangerous==2.1.2; python_version >= "3.7"
  jinja2==3.1.1; python_version >= "3.7"
  markupsafe==2.1.1; python_version >= "3.7"
  multidict==5.2.0; python_version >= "3.6"
  rfc3986[idna2008]==1.5.0
  sanic==20.12.6
  sniffio==1.2.0; python_version >= "3.5"
  ujson==5.2.0; sys_platform != "win32" and implementation_name == "cpython"
  uvloop==0.16.0; sys_platform != "win32" and implementation_name == "cpython"
  websockets==9.1; python_full_version >= "3.6.1"
  werkzeug==2.1.1; python_version >= "3.7"
  zipp==3.8.0; python_version >= "3.7"`;

  fs.writeFileSync(path.join(fixture, 'requirements.txt'), requirements);

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

  fs.unlinkSync(path.join(fixture, 'requirements.txt'));

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

// eslint-disable-next-line no-restricted-syntax
for (const fixture of fs.readdirSync(fixturesPath)) {
  // eslint-disable-next-line no-loop-func
  it(`should build ${fixture}`, async () => {
    await expect(
      testDeployment(
        { builderUrl, buildUtilsUrl },
        path.join(fixturesPath, fixture)
      )
    ).resolves.toBeDefined();
  });
}
