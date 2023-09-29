const fs = require('fs-extra');
const { join, resolve } = require('path');
const _execa = require('execa');
const fetch = require('node-fetch');
const retry = require('async-retry');
const { satisfies } = require('semver');
const stripAnsi = require('strip-ansi');
const {
  fetchCachedToken,
} = require('../../../../test/lib/deployment/now-deploy');
const { spawnSync, execFileSync } = require('child_process');

jest.setTimeout(10 * 60 * 1000);

const isCI = !!process.env.CI;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let port = 3000;

const binaryPath = resolve(__dirname, `../../scripts/start.js`);
const fixture = name => join('test', 'dev', 'fixtures', name);
const fixtureAbsolute = name => join(__dirname, 'fixtures', name);
const exampleAbsolute = name =>
  join(__dirname, '..', '..', '..', '..', 'examples', name);

let processCounter = 0;
const processList = new Map();

function execa(...args) {
  const procId = ++processCounter;
  const child = _execa(...args);

  processList.set(procId, child);
  child.on('close', () => processList.delete(procId));

  return child;
}

function fetchWithRetry(url, opts = {}) {
  return retry(
    async () => {
      const res = await fetch(url, opts);

      if (res.status !== opts.status) {
        const text = await res.text();
        throw new Error(
          `Failed to fetch "${url}", received ${res.status}, expected ${
            opts.status
          }, id: ${res.headers.get('x-vercel-id')}:\n\n${text}\n\n`
        );
      }

      return res;
    },
    {
      retries: opts.retries ?? 3,
      factor: 1,
    }
  );
}

function createResolver() {
  let resolver;
  let rejector;
  const p = new Promise((resolve, reject) => {
    resolver = resolve;
    rejector = reject;
  });
  p.resolve = resolver;
  p.reject = rejector;
  return p;
}

function formatOutput({ stderr, stdout }) {
  return `Received:\n"${stderr}"\n"${stdout}"`;
}

function printOutput(fixture, stdout, stderr) {
  const lines = (
    `\nOutput for "${fixture}"\n` +
    `\n----- stdout -----\n` +
    stdout +
    `\n----- stderr -----\n` +
    stderr
  ).split('\n');

  const getPrefix = nr => {
    return nr === 0 ? '╭' : nr === lines.length - 1 ? '╰' : '│';
  };

  console.log(
    lines.map((line, index) => ` ${getPrefix(index)} ${line}`).join('\n')
  );
}

function shouldSkip(name, versions) {
  if (!satisfies(process.version, versions)) {
    console.log(`Skipping "${name}" because it requires "${versions}".`);
    return true;
  }

  return false;
}

function validateResponseHeaders(res, podId) {
  if (res.status < 500) {
    expect(res.headers.get('server')).toEqual('Vercel');
    expect(res.headers.get('cache-control').length > 0).toBeTruthy();
    expect(res.headers.get('x-vercel-id')).toBeTruthy();
    if (podId) {
      expect(
        res.headers.get('x-vercel-id').includes(`::${podId}-`)
      ).toBeTruthy();
    }
  }
}

async function exec(directory, args = []) {
  const token = await fetchCachedToken();
  console.log(
    `exec() ${binaryPath} dev ${directory} -t ***${
      process.env.VERCEL_TEAM_ID ? ' --scope ***' : ''
    } ${args.join(' ')}`
  );
  return execa(
    binaryPath,
    [
      'dev',
      directory,
      '-t',
      token,
      ...(process.env.VERCEL_TEAM_ID
        ? ['--scope', process.env.VERCEL_TEAM_ID]
        : []),
      ...args,
    ],
    {
      reject: false,
      shell: true,
      env: { __VERCEL_SKIP_DEV_CMD: 1 },
    }
  );
}

async function runNpmInstall(fixturePath) {
  if (await fs.pathExists(join(fixturePath, 'package.json'))) {
    let result;
    try {
      result = await execa('npm', ['install'], {
        cwd: fixturePath,
        shell: true,
        stdio: 'string',
      });
    } catch (e) {
      console.error(result.stderr);
    }
  }
}

async function testPath(
  isDev,
  origin,
  status,
  path,
  expectedText,
  expectedHeaders = {},
  fetchOpts = {}
) {
  const opts = {
    retries: isCI ? 5 : 0,
    ...fetchOpts,
    redirect: 'manual-dont-change',
    status,
  };
  const url = `${origin}${path}`;
  const res = await fetchWithRetry(url, opts);
  const msg = `Testing response from ${fetchOpts.method || 'GET'} ${url}`;
  console.log(msg);
  expect(res.status).toBe(status);
  validateResponseHeaders(res);
  if (typeof expectedText === 'string') {
    const actualText = await res.text();
    expect(actualText.trim()).toBe(expectedText.trim());
  } else if (typeof expectedText === 'function') {
    const actualText = await res.text();
    await expectedText(actualText, res, isDev);
  } else if (expectedText instanceof RegExp) {
    const actualText = await res.text();
    expectedText.lastIndex = 0; // reset since we test twice
    expect(actualText).toMatch(expectedText);
  }
  if (expectedHeaders) {
    Object.entries(expectedHeaders).forEach(([key, expectedValue]) => {
      let actualValue = res.headers.get(key);
      if (key.toLowerCase() === 'location' && actualValue === '//') {
        // HACK: `node-fetch` has strange behavior for location header so fix it
        // with `manual-dont-change` opt and convert double slash to single.
        // See https://github.com/node-fetch/node-fetch/issues/417#issuecomment-587233352
        actualValue = '/';
      }
      expect(actualValue).toBe(expectedValue);
    });
  }
}

async function testFixture(directory, opts = {}, args = []) {
  await runNpmInstall(directory);

  const token = await fetchCachedToken();
  console.log(
    `testFixture() ${binaryPath} dev ${directory} -t ***${
      process.env.VERCEL_TEAM_ID ? ' --scope ***' : ''
    } -l ${port} ${args.join(' ')}`
  );
  const dev = execa(
    binaryPath,
    [
      'dev',
      directory,
      '-t',
      token,
      ...(process.env.VERCEL_TEAM_ID
        ? ['--scope', process.env.VERCEL_TEAM_ID]
        : []),
      '-l',
      String(port),
      ...args,
    ],
    {
      reject: false,
      shell: true,
      stdio: 'pipe',
      ...opts,
      env: { ...opts.env, __VERCEL_SKIP_DEV_CMD: 1 },
    }
  );

  let stdout = '';
  let stderr = '';
  const readyResolver = createResolver();
  const exitResolver = createResolver();

  dev.stdout.setEncoding('utf8');
  dev.stderr.setEncoding('utf8');

  dev.stdout.on('data', data => {
    stdout += data;
  });
  dev.stderr.on('data', data => {
    stderr += data;

    if (stripAnsi(stderr).includes('Ready! Available at')) {
      readyResolver.resolve();
    }
  });

  let printedOutput = false;
  let devTimer = null;

  dev.on('exit', code => {
    devTimer = setTimeout(async () => {
      const pids = Object.keys(await ps(dev.pid)).join(', ');
      console.error(
        `Test ${directory} exited with code ${code}, but has timed out closing stdio\n` +
          (pids
            ? `Hanging child processes: ${pids}`
            : `${dev.pid} already exited`)
      );
    }, 5000);
  });

  dev.on('close', () => {
    clearTimeout(devTimer);
    if (!printedOutput) {
      printOutput(directory, stdout, stderr);
      printedOutput = true;
    }
    exitResolver.resolve();
    readyResolver.resolve();
  });

  dev.on('error', () => {
    if (!printedOutput) {
      printOutput(directory, stdout, stderr);
      printedOutput = true;
    }
    exitResolver.resolve();
    readyResolver.resolve();
  });

  dev._kill = dev.kill;
  dev.kill = async () => {
    // kill the entire process tree for the child as some tests will spawn
    // child processes that either become defunct or assigned a new parent
    // process
    await nukeProcessTree(dev.pid);

    await exitResolver;
    return {
      stdout,
      stderr,
    };
  };

  return {
    dev,
    port,
    readyResolver,
  };
}

function testFixtureStdio(
  directory,
  fn,
  {
    expectedCode = 0,
    skipDeploy,
    isExample,
    projectSettings,
    readyTimeout = 0,
  } = {}
) {
  return async () => {
    const nodeMajor = Number(process.versions.node.split('.')[0]);
    if (isExample && nodeMajor < 12) {
      console.log(`Skipping ${directory} on Node ${process.version}`);
      return;
    }
    const cwd = isExample
      ? exampleAbsolute(directory)
      : fixtureAbsolute(directory);
    const token = await fetchCachedToken();
    let deploymentUrl;

    // Deploy fixture and link project
    if (!skipDeploy) {
      const projectJsonPath = join(cwd, '.vercel', 'project.json');
      await fs.remove(projectJsonPath);
      const gitignore = join(cwd, '.gitignore');
      const hasGitignore = await fs.pathExists(gitignore);

      try {
        // Run `vc link`
        const linkResult = await execa(
          binaryPath,
          [
            '-t',
            token,
            ...(process.env.VERCEL_TEAM_ID
              ? ['--scope', process.env.VERCEL_TEAM_ID]
              : []),
            'link',
            '--yes',
          ],
          { cwd, stdio: 'pipe', reject: false }
        );
        console.log({
          stderr: linkResult.stderr,
          stdout: linkResult.stdout,
        });
        expect(linkResult.exitCode).toBe(0);

        // Patch the project with any non-default properties
        if (projectSettings) {
          const { projectId } = await fs.readJson(projectJsonPath);
          const res = await fetchWithRetry(
            `https://api.vercel.com/v2/projects/${projectId}${
              process.env.VERCEL_TEAM_ID
                ? `?teamId=${process.env.VERCEL_TEAM_ID}`
                : ''
            }`,
            {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(projectSettings),
              retries: isCI ? 3 : 0,
              status: 200,
            }
          );
          expect(res.status).toBe(200);
        }

        // Run `vc deploy`
        let deployResult = await execa(
          binaryPath,
          [
            '-t',
            token,
            ...(process.env.VERCEL_TEAM_ID
              ? ['--scope', process.env.VERCEL_TEAM_ID]
              : []),
            'deploy',
            ...(process.env.VERCEL_CLI_VERSION
              ? [
                  '--build-env',
                  `VERCEL_CLI_VERSION=${process.env.VERCEL_CLI_VERSION}`,
                ]
              : []),
            '--public',
            '--debug',
          ],
          { cwd, stdio: 'pipe', reject: false }
        );
        console.log({
          exitCode: deployResult.exitCode,
          stdout: deployResult.stdout,
          stderr: deployResult.stderr,
        });
        expect(deployResult.exitCode).toBe(expectedCode);
        if (expectedCode === 0) {
          deploymentUrl = new URL(deployResult.stdout).host;
        }
      } finally {
        if (!hasGitignore) {
          await fs.remove(gitignore);
        }
      }
    }

    // Start dev
    let dev;

    await runNpmInstall(cwd);

    let stdout = '';
    let stderr = '';
    const readyResolver = createResolver();
    const exitResolver = createResolver();

    // By default, tests will wait 6 minutes for the dev server to be ready and
    // perform the tests, however a `readyTimeout` can be used to reduce the
    // wait time if the dev server is expected to fail to start or hang
    let readyTimer = null;
    if (readyTimeout > 0) {
      readyTimer = setTimeout(() => {
        readyResolver.reject(
          new Error('Dev server timed out while waiting to be ready')
        );
      }, readyTimeout);
    }

    try {
      let printedOutput = false;

      console.log(
        `testFixtureStdio() ${binaryPath} dev -l ${port} -t ***${
          process.env.VERCEL_TEAM_ID ? ' --scope ***' : ''
        } --debug`
      );
      const env = skipDeploy
        ? { ...process.env, __VERCEL_SKIP_DEV_CMD: 1 }
        : process.env;
      dev = execa(
        binaryPath,
        [
          'dev',
          '-l',
          port,
          '-t',
          token,
          ...(process.env.VERCEL_TEAM_ID
            ? ['--scope', process.env.VERCEL_TEAM_ID]
            : []),
          '--debug',
        ],
        {
          cwd,
          env,
        }
      );

      dev.stdout.setEncoding('utf8');
      dev.stderr.setEncoding('utf8');

      dev.stdout.pipe(process.stdout);
      dev.stderr.pipe(process.stderr);

      dev.stdout.on('data', data => {
        stdout += data;
      });

      dev.stderr.on('data', async data => {
        stderr += data;

        if (stripAnsi(data).includes('Ready! Available at')) {
          clearTimeout(readyTimer);
          readyResolver.resolve();
        }

        if (stderr.includes(`Requested port ${port} is already in use`)) {
          await nukeProcessTree(dev.pid);
          throw new Error(
            `Failed for "${directory}" with port ${port} with stderr "${stderr}".`
          );
        }

        if (stderr.includes('Command failed')) {
          await nukeProcessTree(dev.pid);
          throw new Error(`Failed for "${directory}" with stderr "${stderr}".`);
        }
      });

      dev.on('close', () => {
        if (!printedOutput) {
          printOutput(directory, stdout, stderr);
          printedOutput = true;
        }
        exitResolver.resolve();
      });

      dev.on('error', () => {
        if (!printedOutput) {
          printOutput(directory, stdout, stderr);
          printedOutput = true;
        }
        exitResolver.resolve();
      });

      await readyResolver;

      const helperTestPath = async (...args) => {
        if (!skipDeploy) {
          await testPath(false, `https://${deploymentUrl}`, ...args);
        }
        await testPath(true, `http://localhost:${port}`, ...args);
      };
      await fn(helperTestPath, port);
    } finally {
      await nukeProcessTree(dev.pid);
      await exitResolver;
    }
  };
}

async function ps(parentPid, pids = {}) {
  const cmd =
    process.platform === 'darwin'
      ? ['pgrep', '-P', parentPid]
      : ['ps', '-o', 'pid', '--no-headers', '--ppid', parentPid];

  try {
    const buf = execFileSync(cmd[0], cmd.slice(1), {
      encoding: 'utf-8',
    });
    for (let pid of buf.match(/\d+/g)) {
      pid = parseInt(pid);
      const recurse = Object.prototype.hasOwnProperty.call(pids, pid);
      pids[parentPid].push(pid);
      pids[pid] = [];
      if (recurse) {
        await ps(pid, pids);
      }
    }
  } catch (e) {
    console.log(`Failed to get processes: ${e.toString()}`);
  }
  return pids;
}

async function nukePID(pid, signal = 'SIGTERM', retries = 10) {
  if (retries === 0) {
    console.log(`pid ${pid} won't die, giving up`);
    return;
  }

  // kill the process
  try {
    process.kill(pid, signal);
  } catch (e) {
    // process does not exist
    console.log(`pid ${pid} is not running`);
    return;
  }

  await sleep(250);

  try {
    // check if killed
    process.kill(pid, 0);
  } catch (e) {
    console.log(`pid ${pid} is not running`);
    return;
  }

  console.log(`pid ${pid} didn't exit, sending SIGKILL (retries ${retries})`);
  await nukePID(pid, 'SIGKILL', retries - 1);
}

async function nukeProcessTree(pid, signal) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', pid, '/T', '/F'], { stdio: 'inherit' });
    return;
  }

  const pids = await ps(pid, {
    [pid]: [],
  });

  console.log(`Nuking pids: ${Object.keys(pids).join(', ')}`);
  await Promise.all(Object.keys(pids).map(pid => nukePID(pid, signal)));
}

beforeEach(() => {
  port = ++port;
});

afterEach(async () => {
  await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Array.from(processList).map(async ([_procId, proc]) => {
      console.log(`killing process ${proc.pid} "${proc.spawnargs.join(' ')}"`);

      try {
        await nukeProcessTree(proc.pid);
      } catch (err) {
        // Was already killed
        if (err.code !== 'ESRCH') {
          console.error('Failed to kill process', proc.pid, err);
        }
      }
    })
  );
});

module.exports = {
  sleep,
  testPath,
  testFixture,
  testFixtureStdio,
  exec,
  formatOutput,
  shouldSkip,
  fixture,
  fetch,
  fetchWithRetry,
  validateResponseHeaders,
};
