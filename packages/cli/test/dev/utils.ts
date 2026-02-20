import fs from 'fs-extra';
import { join, resolve } from 'path';
import type { ExecaChildProcess } from 'execa';
import _execa, { type Options } from 'execa';
import retry from 'async-retry';
import { satisfies } from 'semver';
import stripAnsi from 'strip-ansi';
import { fetchCachedToken } from '../../../../test/lib/deployment/now-deploy';
import { spawnSync, execFileSync } from 'child_process';

jest.setTimeout(10 * 60 * 1000);

const isCI = !!process.env.CI;

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const BASE_PORT = 3000;
const PORTS_PER_WORKER = 1000;
const rawWorkerId = Number.parseInt(process.env.JEST_WORKER_ID || '1', 10);
const workerId =
  Number.isFinite(rawWorkerId) && rawWorkerId > 0 ? rawWorkerId : 1;

// Jest may run dev integration files in parallel workers. Keep each worker
// in its own port range to avoid cross-worker collisions.
let port = BASE_PORT + (workerId - 1) * PORTS_PER_WORKER;

const binaryPath = resolve(__dirname, `../../scripts/start.js`);

export function fixture(name: string) {
  return join('test', 'dev', 'fixtures', name);
}

const fixtureAbsolute = (name: string) => join(__dirname, 'fixtures', name);

let processCounter = 0;
const processList = new Map();

function execa(initial: string, args: string[], options: Options<null> = {}) {
  const procId = ++processCounter;
  const child = _execa(initial, args, options);

  processList.set(procId, child);
  child.on('close', () => processList.delete(procId));

  return child;
}

type FetchOptions = RequestInit & {
  status?: number;
  retries?: number;
};

export function fetchWithRetry(url: string, opts: FetchOptions = {}) {
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

type ResolverPromise<T> = Promise<T> & {
  resolve: (value: PromiseLike<null> | null) => void;
  reject: (reason?: any) => void;
};

function createResolver(): ResolverPromise<null> {
  let resolver: ResolverPromise<null>['resolve'];
  let rejector: ResolverPromise<null>['reject'];

  const p = new Promise((resolve, reject) => {
    resolver = resolve;
    rejector = reject;
  }) as ResolverPromise<null>;

  //@ts-expect-error
  p.resolve = resolver;
  //@ts-expect-error
  p.reject = rejector;

  return p;
}

export function formatOutput({
  stderr,
  stdout,
}: {
  stderr: string;
  stdout: string;
}) {
  return `Received:\n"${stderr}"\n"${stdout}"`;
}

function printOutput(fixture: string, stdout: string, stderr: string) {
  const lines = (
    `\nOutput for "${fixture}"\n` +
    `\n----- stdout -----\n` +
    stdout +
    `\n----- stderr -----\n` +
    stderr
  ).split('\n');

  const getPrefix = (nr: number) => {
    return nr === 0 ? '╭' : nr === lines.length - 1 ? '╰' : '│';
  };

  // eslint-disable-next-line no-console
  console.log(
    lines.map((line, index) => ` ${getPrefix(index)} ${line}`).join('\n')
  );
}

export function shouldSkip(name: string, versions: string) {
  if (!satisfies(process.version, versions)) {
    // eslint-disable-next-line no-console
    console.log(`Skipping "${name}" because it requires "${versions}".`);
    return true;
  }

  return false;
}

export function validateResponseHeaders(res: Response, podId?: string) {
  if (res.status < 500) {
    const cacheControlCount = res.headers.get('cache-control')?.length || 0;
    expect(cacheControlCount > 0).toBeTruthy();

    expect(res.headers.get('server')).toEqual('Vercel');
    expect(res.headers.get('x-vercel-id')).toBeTruthy();

    if (podId) {
      const vercelID = res.headers.get('x-vercel-id') || '';
      expect(vercelID.includes(`::${podId}-`)).toBeTruthy();
    }
  }
}

export async function exec(directory: string, args: string[] = []) {
  const token = await fetchCachedToken();

  // eslint-disable-next-line no-console
  console.log(
    `exec() ${binaryPath} dev ${directory} -t ***${
      process.env.VERCEL_TEAM_ID ? ' --scope ***' : ''
    } ${args.join(' ')}`
  );

  const scope: string[] = process.env.VERCEL_TEAM_ID
    ? ['--scope', process.env.VERCEL_TEAM_ID]
    : [];

  return execa(binaryPath, ['dev', directory, '-t', token, ...scope, ...args], {
    reject: false,
    shell: true,
    env: { __VERCEL_SKIP_DEV_CMD: '1' },
  });
}

async function runNpmInstall(fixturePath: string) {
  if (await fs.pathExists(join(fixturePath, 'package.json'))) {
    let command;
    if (await fs.pathExists(join(fixturePath, 'package-lock.json'))) {
      command = 'npm';
    } else {
      command = 'yarn';
    }
    await execa(command, ['install'], {
      cwd: fixturePath,
      shell: true,
      stdio: 'inherit',
    });
  }
}

export async function testPath(
  isDev: boolean,
  origin: string,
  status: number,
  path: string,
  expectedText: string | Function | RegExp,
  expectedHeaders = {},
  fetchOpts: FetchOptions = {}
) {
  const opts: FetchOptions = {
    retries: isCI ? 5 : 0,
    ...fetchOpts,
    // @ts-expect-error - this value is part of a hack to work around
    // https://github.com/node-fetch/node-fetch/issues/417#issuecomment-587233352
    redirect: 'manual-dont-change',
    status,
  };
  const url = `${origin}${path}`;
  const res = await fetchWithRetry(url, opts);
  const msg = `Testing response from ${fetchOpts.method || 'GET'} ${url}`;

  // eslint-disable-next-line no-console
  console.log(msg);
  expect(res.status, getEnvironmentMessage(isDev)).toBe(status);
  validateResponseHeaders(res);

  if (typeof expectedText === 'string') {
    const actualText = await res.text();
    expect(actualText.trim(), getEnvironmentMessage(isDev)).toBe(
      expectedText.trim()
    );
  } else if (typeof expectedText === 'function') {
    const actualText = await res.text();
    await expectedText(actualText, res, isDev);
  } else if (expectedText instanceof RegExp) {
    const actualText = await res.text();
    expectedText.lastIndex = 0; // reset since we test twice
    expect(actualText, getEnvironmentMessage(isDev)).toMatch(expectedText);
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
      expect(actualValue, getEnvironmentMessage(isDev)).toBe(expectedValue);
    });
  }
}

function getEnvironmentMessage(isDev: boolean): string {
  if (isDev) {
    return 'FROM DEV SERVER';
  }
  return `FROM DEPLOYMENT`;
}

export async function testFixture(
  directory: string,
  opts: Options<null> = {},
  args: string[] = []
) {
  await runNpmInstall(directory);

  const token = await fetchCachedToken();

  // eslint-disable-next-line no-console
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
      env: { ...opts.env, __VERCEL_SKIP_DEV_CMD: '1' },
    }
  );

  let stdout = '';
  let stderr = '';
  const readyResolver = createResolver();
  const exitResolver = createResolver();

  if (!dev.stdout) {
    throw new Error('`vc dev` process missing "stdout".');
  }
  if (!dev.stderr) {
    throw new Error('`vc dev` process missing "stderr".');
  }

  dev.stdout.setEncoding('utf8');
  dev.stderr.setEncoding('utf8');

  dev.stdout.on('data', data => {
    stdout += data;
  });
  dev.stderr.on('data', data => {
    stderr += data;

    if (stripAnsi(stderr).includes('Ready! Available at')) {
      readyResolver.resolve(null);
    }
  });

  let printedOutput = false;
  let devTimer: NodeJS.Timeout;

  dev.on('exit', code => {
    devTimer = setTimeout(async () => {
      const pids = Object.keys(await ps(dev.pid!)).join(', ');

      // eslint-disable-next-line no-console
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
    exitResolver.resolve(null);
    readyResolver.resolve(null);
  });

  dev.on('error', () => {
    if (!printedOutput) {
      printOutput(directory, stdout, stderr);
      printedOutput = true;
    }
    exitResolver.resolve(null);
    readyResolver.resolve(null);
  });

  // @ts-expect-error
  dev.kill = async () => {
    // kill the entire process tree for the child as some tests will spawn
    // child processes that either become defunct or assigned a new parent
    // process
    await nukeProcessTree(dev.pid!);

    await exitResolver;
    return {
      stdout,
      stderr,
    };
  };

  return {
    dev: dev as any as Omit<typeof dev, 'kill'> & {
      kill: () => Promise<{ stdout: string; stderr: string }>;
    },
    port,
    readyResolver,
  };
}

export function testFixtureStdio(
  directory: string,
  fn: Function,
  { skipDeploy = false } = {}
) {
  return async () => {
    const cwd = fixtureAbsolute(directory);
    const token = await fetchCachedToken();
    let deploymentUrl: string;

    // Deploy fixture and link project
    if (!skipDeploy) {
      const projectJsonPath = join(cwd, '.vercel', 'project.json');
      await fs.remove(projectJsonPath);
      const gitignore = join(cwd, '.gitignore');
      const hasGitignore = await fs.pathExists(gitignore);

      try {
        const args = [];

        args.push('--token', token);

        if (process.env.VERCEL_TEAM_ID) {
          args.push('--scope', process.env.VERCEL_TEAM_ID);
        }

        args.push('deploy');

        if (process.env.VERCEL_CLI_VERSION) {
          args.push(
            '--build-env',
            `VERCEL_CLI_VERSION=${process.env.VERCEL_CLI_VERSION}`
          );
        }

        args.push('--debug');
        args.push('--yes');

        // Run `vc deploy`
        const deployResult = await execa(binaryPath, args, {
          cwd,
          stdio: 'pipe',
          reject: false,
        });

        const errorDetails = JSON.stringify({
          exitCode: deployResult.exitCode,
          stdout: deployResult.stdout,
          stderr: deployResult.stderr,
        });

        // Expect the deploy succeeded with exit of 0;
        expect(deployResult.exitCode, errorDetails).toBe(0);
        deploymentUrl = new URL(deployResult.stdout.toString()).host;
      } finally {
        if (!hasGitignore) {
          await fs.remove(gitignore);
        }
      }
    }

    // Start dev
    let dev: ExecaChildProcess<Buffer>;

    await runNpmInstall(cwd);

    let stdout = '';
    let stderr = '';
    const readyResolver = createResolver();
    const exitResolver = createResolver();

    try {
      let printedOutput = false;

      // eslint-disable-next-line no-console
      console.log(
        `testFixtureStdio() ${binaryPath} dev -l ${port} -t ***${
          process.env.VERCEL_TEAM_ID ? ' --scope ***' : ''
        } --debug`
      );
      const env = skipDeploy
        ? { ...process.env, __VERCEL_SKIP_DEV_CMD: '1' }
        : process.env;
      dev = execa(
        binaryPath,
        [
          'dev',
          '-l',
          port.toString(),
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

      if (!dev.stdout) {
        throw new Error('`vc dev` missing "stdout"');
      }
      if (!dev.stderr) {
        throw new Error('`vc dev` missing "stderr"');
      }

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
          readyResolver.resolve(null);
        }

        if (stderr.includes(`Requested port ${port} is already in use`)) {
          await nukeProcessTree(dev.pid!);
          throw new Error(
            `Failed for "${directory}" with port ${port} with stderr "${stderr}".`
          );
        }

        if (stderr.includes('Command failed')) {
          await nukeProcessTree(dev.pid!);
          throw new Error(`Failed for "${directory}" with stderr "${stderr}".`);
        }
      });

      dev.on('close', () => {
        if (!printedOutput) {
          printOutput(directory, stdout, stderr);
          printedOutput = true;
        }
        exitResolver.resolve(null);
      });

      dev.on('error', () => {
        if (!printedOutput) {
          printOutput(directory, stdout, stderr);
          printedOutput = true;
        }
        exitResolver.resolve(null);
      });

      await readyResolver;

      const helperTestPath = async (...args: any[]) => {
        if (!skipDeploy) {
          // @ts-ignore
          await testPath(false, `https://${deploymentUrl}`, ...args);
        }
        // @ts-ignore
        await testPath(true, `http://localhost:${port}`, ...args);
      };
      await fn(helperTestPath, port);
    } finally {
      // @ts-ignore
      await nukeProcessTree(dev.pid);
      await exitResolver;
    }
  };
}

async function ps(parentPid: number, pids: Record<string, Array<number>> = {}) {
  const cmd: string[] =
    process.platform === 'darwin'
      ? ['pgrep', '-P', parentPid.toString()]
      : ['ps', '-o', 'pid', '--no-headers', '--ppid', parentPid.toString()];

  try {
    const buf = execFileSync(cmd[0], cmd.slice(1), {
      encoding: 'utf-8',
    });
    const possiblePids = buf.match(/\d+/g) || [];
    for (const rawPid of possiblePids) {
      const pid = parseInt(rawPid);
      const recurse = Object.prototype.hasOwnProperty.call(pids, pid);
      pids[parentPid].push(pid);
      pids[pid] = [];
      if (recurse) {
        await ps(pid, pids);
      }
    }
  } catch (err) {
    const error = err as Error;
    // eslint-disable-next-line no-console
    console.log(`Failed to get processes: ${error.toString()}`);
  }
  return pids;
}

async function nukePID(
  pid: number,
  signal: string = 'SIGTERM',
  retries: number = 10
) {
  if (retries === 0) {
    // eslint-disable-next-line no-console
    console.log(`pid ${pid} won't die, giving up`);
    return;
  }

  // kill the process
  try {
    process.kill(pid, signal);
  } catch (e) {
    // process does not exist

    // eslint-disable-next-line no-console
    console.log(`pid ${pid} is not running`);
    return;
  }

  await sleep(250);

  try {
    // check if killed
    process.kill(pid, 0);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(`pid ${pid} is not running`);
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`pid ${pid} didn't exit, sending SIGKILL (retries ${retries})`);
  await nukePID(pid, 'SIGKILL', retries - 1);
}

async function nukeProcessTree(pid: number, signal?: string) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', pid.toString(), '/T', '/F'], {
      stdio: 'inherit',
    });
    return;
  }

  const pids = await ps(pid, {
    [pid]: [],
  });

  // eslint-disable-next-line no-console
  console.log(`Nuking pids: ${Object.keys(pids).join(', ')}`);
  await Promise.all(Object.keys(pids).map(pid => nukePID(Number(pid), signal)));
}

beforeEach(() => {
  port = ++port;
});

afterEach(async () => {
  await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Array.from(processList).map(async ([_procId, proc]) => {
      // eslint-disable-next-line no-console
      console.log(`killing process ${proc.pid} "${proc.spawnargs.join(' ')}"`);

      try {
        await nukeProcessTree(proc.pid);
      } catch (err) {
        const error = err as Error & { code?: string };

        // Was already killed
        if (error.code !== 'ESRCH') {
          // eslint-disable-next-line no-console
          console.error('Failed to kill process', proc.pid, error);
        }
      }
    })
  );
});

export { fetch };
