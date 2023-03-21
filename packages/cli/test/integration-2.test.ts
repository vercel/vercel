import path from 'path';
import { URL, parse as parseUrl } from 'url';
import { Readable } from 'stream';
import { tmpdir } from 'os';
import _execa from 'execa';
import XDGAppPaths from 'xdg-app-paths';
import fetch, { RequestInit } from 'node-fetch';
// @ts-ignore
import tmp from 'tmp-promise';
import retry from 'async-retry';
import fs, {
  writeFile,
  readFile,
  remove,
  copy,
  ensureDir,
  mkdir,
} from 'fs-extra';
import sleep from '../src/util/sleep';
import prepareFixtures from './helpers/prepare';
import { fetchTokenWithRetry } from '../../../test/lib/deployment/now-deploy';
import type { PackageJson } from '@vercel/build-utils';
import type http from 'http';

const TEST_TIMEOUT = 3 * 60 * 1000;
jest.setTimeout(TEST_TIMEOUT);

const PROMPT_TIMEOUT = 3000;

type BoundChildProcess = _execa.ExecaChildProcess & {
  stdout: Readable;
  stdin: Readable;
  stderr: Readable;
};

interface TmpDir {
  name: string;
  removeCallback: () => void;
}

// log command when running `execa`
function execa(
  file: string,
  args: string[],
  options?: _execa.Options<string>
): BoundChildProcess {
  console.log(`$ vercel ${args.join(' ')}`);
  const proc = _execa(file, args, {
    env: {
      NO_COLOR: '1',
    },
    ...options,
  });
  if (proc.stdin === null) {
    console.warn(`vercel ${args.join(' ')} - not bound to stdin`);
  }
  if (proc.stdout === null) {
    console.warn(`vercel ${args.join(' ')} - not bound to stdout`);
  }
  if (proc.stderr === null) {
    console.warn(`vercel ${args.join(' ')} - not bound to stderr`);
  }

  // if a reference to `proc.stdout` (for example) fails later,
  // the logs will say clearly where that came from
  // so, it's not awful to use the type assertion here
  return proc as BoundChildProcess;
}

function fixture(name: string) {
  const directory = path.join(tmpFixturesDir, name);
  const config = path.join(directory, 'project.json');

  // We need to remove it, otherwise we can't re-use fixtures
  if (fs.existsSync(config)) {
    fs.unlinkSync(config);
  }

  return directory;
}

const binaryPath = path.resolve(__dirname, `../scripts/start.js`);
const example = (name: string) =>
  path.join(__dirname, '..', '..', '..', 'examples', name);
let session = 'temp-session';

function fetchTokenInformation(token: string, retries = 3) {
  const url = `https://api.vercel.com/v2/user`;
  const headers = { Authorization: `Bearer ${token}` };

  return retry(
    async () => {
      const res = await fetch(url, { headers });

      if (!res.ok) {
        throw new Error(
          `Failed to fetch ${url}, received status ${res.status}`
        );
      }

      const data = await res.json();

      return data.user;
    },
    { retries, factor: 1 }
  );
}

function formatOutput({
  stderr,
  stdout,
}: {
  stderr: string | Readable;
  stdout: string | Readable;
}) {
  return `
-----

Stderr:
${stderr || '(no output)'}

-----

Stdout:
${stdout || '(no output)'}

-----
  `;
}

function getTmpDir(): TmpDir {
  return tmp.dirSync({
    // This ensures the directory gets
    // deleted even if it has contents
    unsafeCleanup: true,
  }) as TmpDir;
}

const defaultOptions = { reject: false };
const defaultArgs: string[] = [];
let token: string | undefined;
let email: string | undefined;
let contextName: string | undefined;

let tmpDir: TmpDir | undefined;
let tmpFixturesDir = path.join(tmpdir(), 'tmp-fixtures');

let globalDir = XDGAppPaths('com.vercel.cli').dataDirs()[0];

if (!process.env.CI) {
  tmpDir = getTmpDir();
  globalDir = path.join(tmpDir.name, 'com.vercel.tests');

  defaultArgs.push('-Q', globalDir);
  console.log(
    'No CI detected, adding defaultArgs to avoid polluting user settings',
    defaultArgs
  );
}

function mockLoginApi(req: http.IncomingMessage, res: http.ServerResponse) {
  const { url = '/', method } = req;
  let { pathname = '/', query = {} } = parseUrl(url, true);
  console.log(`[mock-login-server] ${method} ${pathname}`);
  const securityCode = 'Bears Beets Battlestar Galactica';
  res.setHeader('content-type', 'application/json');
  if (
    method === 'POST' &&
    pathname === '/registration' &&
    query.mode === 'login'
  ) {
    res.end(JSON.stringify({ token, securityCode }));
  } else if (
    method === 'GET' &&
    pathname === '/registration/verify' &&
    query.email === email
  ) {
    res.end(JSON.stringify({ token }));
  } else {
    res.statusCode = 405;
    res.end(JSON.stringify({ code: 'method_not_allowed' }));
  }
}

let loginApiUrl = '';
const loginApiServer = require('http')
  .createServer(mockLoginApi)
  .listen(0, () => {
    const { port } = loginApiServer.address();
    loginApiUrl = `http://localhost:${port}`;
    console.log(`[mock-login-server] Listening on ${loginApiUrl}`);
  });

const execute = (args: string[], options?: _execa.Options<string>) =>
  execa(binaryPath, [...defaultArgs, ...args], {
    ...defaultOptions,
    ...options,
  });

const apiFetch = (url: string, { headers, ...options }: RequestInit = {}) => {
  return fetch(`https://api.vercel.com${url}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(headers || {}),
    },
    ...options,
  });
};

const waitForPrompt = (
  cp: BoundChildProcess,
  assertion: (chunk: string) => boolean
) =>
  new Promise<void>((resolve, reject) => {
    console.log('Waiting for prompt...');
    const handleTimeout = setTimeout(
      () =>
        reject(
          new Error(`timed out after ${PROMPT_TIMEOUT}ms in waitForPrompt`)
        ),
      PROMPT_TIMEOUT
    );
    const listener = (chunk: string) => {
      console.log('> ' + chunk);
      if (assertion(chunk)) {
        cp.stdout.off && cp.stdout.off('data', listener);
        cp.stderr.off && cp.stderr.off('data', listener);
        clearTimeout(handleTimeout);
        resolve();
      }
    };

    cp.stdout.on('data', listener);
    cp.stderr.on('data', listener);
  });

const createUser = async () => {
  await retry(
    async () => {
      if (!fs.existsSync(globalDir)) {
        console.log('Creating global config directory ', globalDir);
        await ensureDir(globalDir);
      } else {
        console.log('Found global config directory ', globalDir);
      }

      token = await fetchTokenWithRetry();

      await fs.writeJSON(getConfigAuthPath(), { token });

      const user = await fetchTokenInformation(token);

      email = user.email;
      contextName = user.username;
      session = Math.random().toString(36).split('.')[1];
    },
    { retries: 3, factor: 1 }
  );
};

const getConfigAuthPath = () => path.join(globalDir, 'auth.json');

async function setupProject(
  process: BoundChildProcess,
  projectName: string,
  overrides: {
    devCommand?: string;
    buildCommand?: string;
    outputDirectory?: string;
  }
) {
  await waitForPrompt(process, chunk => /Set up [^?]+\?/.test(chunk));
  process.stdin.write('yes\n');

  await waitForPrompt(process, chunk => /Which scope [^?]+\?/.test(chunk));
  process.stdin.write('\n');

  await waitForPrompt(process, chunk =>
    chunk.includes('Link to existing project?')
  );
  process.stdin.write('no\n');

  await waitForPrompt(process, chunk =>
    chunk.includes('What’s your project’s name?')
  );
  process.stdin.write(`${projectName}\n`);

  await waitForPrompt(process, chunk =>
    chunk.includes('In which directory is your code located?')
  );
  process.stdin.write('\n');

  await waitForPrompt(process, chunk =>
    chunk.includes('Want to modify these settings?')
  );

  if (overrides) {
    process.stdin.write('yes\n');

    const { buildCommand, outputDirectory, devCommand } = overrides;

    await waitForPrompt(process, chunk =>
      chunk.includes(
        'Which settings would you like to overwrite (select multiple)?'
      )
    );
    process.stdin.write('a\n'); // 'a' means select all

    await waitForPrompt(process, chunk =>
      chunk.includes(`What's your Build Command?`)
    );
    process.stdin.write(`${buildCommand || ''}\n`);

    await waitForPrompt(process, chunk =>
      chunk.includes(`What's your Development Command?`)
    );
    process.stdin.write(`${devCommand || ''}\n`);

    await waitForPrompt(process, chunk =>
      chunk.includes(`What's your Output Directory?`)
    );
    process.stdin.write(`${outputDirectory || ''}\n`);
  } else {
    process.stdin.write('no\n');
  }

  await waitForPrompt(process, chunk => chunk.includes('Linked to'));
}

beforeAll(async () => {
  try {
    await createUser();
    await prepareFixtures(contextName, binaryPath, tmpFixturesDir);
  } catch (err) {
    console.log('Failed test suite `beforeAll`');
    console.log(err);

    // force test suite to actually stop
    process.exit(1);
  }
});

afterAll(async () => {
  delete process.env.ENABLE_EXPERIMENTAL_COREPACK;

  if (loginApiServer) {
    // Stop mock server
    loginApiServer.close();
  }

  // Make sure the token gets revoked unless it's passed in via environment
  if (!process.env.VERCEL_TOKEN) {
    await execa(binaryPath, ['logout', ...defaultArgs]);
  }

  if (tmpDir) {
    // Remove config directory entirely
    tmpDir.removeCallback();
  }

  if (tmpFixturesDir) {
    console.log('removing tmpFixturesDir', tmpFixturesDir);
    fs.removeSync(tmpFixturesDir);
  }
});

test(
  'change user',
  async () => {
    if (!email) {
      throw new Error('Shared state "email" not set.');
    }

    const { stdout: prevUser } = await execute(['whoami']);

    // Delete the current token
    await execute(['logout', '--debug'], { stdio: 'inherit' });

    await createUser();

    await execute(['login', email, '--api', loginApiUrl, '--debug'], {
      stdio: 'inherit',
      env: {
        FORCE_TTY: '1',
      },
    });

    const auth = await fs.readJSON(getConfigAuthPath());
    expect(auth.token).toBe(token);

    const { stdout: nextUser } = await execute(['whoami']);

    expect(typeof prevUser, prevUser).toBe('string');
    expect(typeof nextUser, nextUser).toBe('string');
    expect(prevUser).not.toBe(nextUser);
  },
  60 * 1000
);

test('assign a domain to a project', async () => {
  const domain = `project-domain.${contextName}.vercel.app`;
  const directory = fixture('static-deployment');

  const deploymentOutput = await execute([directory, '--public', '--yes']);
  expect(deploymentOutput.exitCode, formatOutput(deploymentOutput)).toBe(0);

  const host = deploymentOutput.stdout.trim().replace('https://', '');
  const deployment = await apiFetch(
    `/v10/now/deployments/unknown?url=${host}`
  ).then(resp => resp.json());

  expect(typeof deployment.name).toBe('string');
  const project = deployment.name;

  const output = await execute(['domains', 'add', domain, project, '--force']);
  expect(output.exitCode, formatOutput(output)).toBe(0);

  const removeResponse = await execute(['rm', project, '-y']);
  expect(removeResponse.exitCode, formatOutput(removeResponse)).toBe(0);
});

test('ensure `github` and `scope` are not sent to the API', async () => {
  const directory = fixture('github-and-scope-config');
  const output = await execute([directory, '--yes']);

  expect(output.exitCode, formatOutput(output)).toBe(0);
});

test('should show prompts to set up project during first deploy', async () => {
  const dir = fixture('project-link-deploy');
  const projectName = `project-link-deploy-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const now = execa(binaryPath, [dir, ...defaultArgs]);

  await setupProject(now, projectName, {
    buildCommand: `mkdir -p o && echo '<h1>custom hello</h1>' > o/index.html`,
    outputDirectory: 'o',
  });

  const output = await now;

  // Ensure the exit code is right
  expect(output.exitCode, formatOutput(output)).toBe(0);

  // Ensure .gitignore is created
  const gitignore = await readFile(path.join(dir, '.gitignore'), 'utf8');
  expect(gitignore).toBe('.vercel\n');

  // Ensure .vercel/project.json and .vercel/README.txt are created
  expect(
    fs.existsSync(path.join(dir, '.vercel', 'project.json')),
    'project.json'
  ).toBe(true);
  expect(
    fs.existsSync(path.join(dir, '.vercel', 'README.txt')),
    'README.txt'
  ).toBe(true);

  // Send a test request to the deployment
  const response = await fetch(new URL(output.stdout));
  const text = await response.text();
  expect(text).toContain('<h1>custom hello</h1>');

  // Ensure that `vc dev` also uses the configured build command
  // and output directory
  let stderr = '';
  const port = 58351;
  const dev = execa(binaryPath, [
    'dev',
    '--listen',
    port.toString(),
    dir,
    ...defaultArgs,
  ]);
  dev.stderr.setEncoding('utf8');

  try {
    dev.stdout.pipe(process.stdout);
    dev.stderr.pipe(process.stderr);
    await new Promise<void>((resolve, reject) => {
      dev.once('close', (code, signal) => {
        reject(`"vc dev" failed with ${signal || code}`);
      });
      dev.stderr.on('data', data => {
        stderr += data;
        if (stderr.includes('Ready! Available at')) {
          resolve();
        }
      });
    });

    const res2 = await fetch(`http://localhost:${port}/`);
    const text2 = await res2.text();
    expect(text2).toContain('<h1>custom hello</h1>');
  } finally {
    process.kill(dev.pid, 'SIGTERM');
  }
});

test('should prefill "project name" prompt with folder name', async () => {
  const projectName = `static-deployment-${
    Math.random().toString(36).split('.')[1]
  }`;

  const src = fixture('static-deployment');

  // remove previously linked project if it exists
  await remove(path.join(src, '.vercel'));

  const directory = path.join(src, '../', projectName);
  await copy(src, directory);

  const now = execa(binaryPath, [directory, ...defaultArgs], {
    env: {
      FORCE_TTY: '1',
    },
  });

  await waitForPrompt(now, chunk => /Set up and deploy [^?]+\?/.test(chunk));
  now.stdin.write('yes\n');

  await waitForPrompt(now, chunk =>
    chunk.includes('Which scope do you want to deploy to?')
  );
  now.stdin.write('\n');

  await waitForPrompt(now, chunk =>
    chunk.includes('Link to existing project?')
  );
  now.stdin.write('no\n');

  await waitForPrompt(now, chunk =>
    chunk.includes(`What’s your project’s name? (${projectName})`)
  );
  now.stdin.write(`\n`);

  await waitForPrompt(now, chunk =>
    chunk.includes('In which directory is your code located?')
  );
  now.stdin.write('\n');

  await waitForPrompt(now, chunk =>
    chunk.includes('Want to modify these settings?')
  );
  now.stdin.write('no\n');

  const output = await now;
  expect(output.exitCode, formatOutput(output)).toBe(0);
});

test('should prefill "project name" prompt with --name', async () => {
  const directory = fixture('static-deployment');
  const projectName = `static-deployment-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(directory, '.vercel'));

  const now = execa(
    binaryPath,
    [directory, '--name', projectName, ...defaultArgs],
    {
      env: {
        FORCE_TTY: '1',
      },
    }
  );

  let isDeprecated = false;

  await waitForPrompt(now, chunk => {
    if (chunk.includes('The "--name" option is deprecated')) {
      isDeprecated = true;
    }

    return /Set up and deploy [^?]+\?/.test(chunk);
  });
  now.stdin.write('yes\n');

  expect(isDeprecated, 'isDeprecated').toBe(true);

  await waitForPrompt(now, chunk =>
    chunk.includes('Which scope do you want to deploy to?')
  );
  now.stdin.write('\n');

  await waitForPrompt(now, chunk =>
    chunk.includes('Link to existing project?')
  );
  now.stdin.write('no\n');

  await waitForPrompt(now, chunk =>
    chunk.includes(`What’s your project’s name? (${projectName})`)
  );
  now.stdin.write(`\n`);

  await waitForPrompt(now, chunk =>
    chunk.includes('In which directory is your code located?')
  );
  now.stdin.write('\n');

  await waitForPrompt(now, chunk =>
    chunk.includes('Want to modify these settings?')
  );
  now.stdin.write('no\n');

  const output = await now;
  expect(output.exitCode, formatOutput(output)).toBe(0);
});

test('should prefill "project name" prompt with now.json `name`', async () => {
  const directory = fixture('static-deployment');
  const projectName = `static-deployment-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(directory, '.vercel'));
  await fs.writeFile(
    path.join(directory, 'vercel.json'),
    JSON.stringify({
      name: projectName,
    })
  );

  const now = execa(binaryPath, [directory, ...defaultArgs], {
    env: {
      FORCE_TTY: '1',
    },
  });

  let isDeprecated = false;

  now.stderr.on('data', data => {
    if (
      data
        .toString()
        .includes('The `name` property in vercel.json is deprecated')
    ) {
      isDeprecated = true;
    }
  });

  await waitForPrompt(now, chunk => {
    return /Set up and deploy [^?]+\?/.test(chunk);
  });
  now.stdin.write('yes\n');

  await waitForPrompt(now, chunk =>
    chunk.includes('Which scope do you want to deploy to?')
  );
  now.stdin.write('\n');

  await waitForPrompt(now, chunk =>
    chunk.includes('Link to existing project?')
  );
  now.stdin.write('no\n');

  await waitForPrompt(now, chunk =>
    chunk.includes(`What’s your project’s name? (${projectName})`)
  );
  now.stdin.write(`\n`);

  await waitForPrompt(now, chunk =>
    chunk.includes('In which directory is your code located?')
  );
  now.stdin.write('\n');

  await waitForPrompt(now, chunk =>
    chunk.includes('Want to modify these settings?')
  );
  now.stdin.write('no\n');

  const output = await now;
  expect(output.exitCode, formatOutput(output)).toBe(0);

  expect(isDeprecated, 'isDeprecated').toBe(true);

  // clean up
  await remove(path.join(directory, 'vercel.json'));
});

test('deploy with unknown `VERCEL_PROJECT_ID` should fail', async () => {
  if (!token) {
    throw new Error('Shared state "token" not set.');
  }

  const directory = fixture('static-deployment');
  const user = await fetchTokenInformation(token);

  const output = await execute([directory], {
    env: {
      VERCEL_ORG_ID: user.id,
      VERCEL_PROJECT_ID: 'asdf',
    },
  });

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toContain('Project not found');
});

test('deploy with `VERCEL_ORG_ID` but without `VERCEL_PROJECT_ID` should fail', async () => {
  if (!token) {
    throw new Error('Shared state "token" not set.');
  }

  const directory = fixture('static-deployment');
  const user = await fetchTokenInformation(token);

  const output = await execute([directory], {
    env: { VERCEL_ORG_ID: user.id },
  });

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toContain(
    'You specified `VERCEL_ORG_ID` but you forgot to specify `VERCEL_PROJECT_ID`. You need to specify both to deploy to a custom project.'
  );
});

test('deploy with `VERCEL_PROJECT_ID` but without `VERCEL_ORG_ID` should fail', async () => {
  const directory = fixture('static-deployment');

  const output = await execute([directory], {
    env: { VERCEL_PROJECT_ID: 'asdf' },
  });

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toContain(
    'You specified `VERCEL_PROJECT_ID` but you forgot to specify `VERCEL_ORG_ID`. You need to specify both to deploy to a custom project.'
  );
});

test('deploy with `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`', async () => {
  const directory = fixture('static-deployment');

  // generate `.vercel`
  await execute([directory, '--yes']);

  const link = require(path.join(directory, '.vercel/project.json'));
  await remove(path.join(directory, '.vercel'));

  const output = await execute([directory], {
    env: {
      VERCEL_ORG_ID: link.orgId,
      VERCEL_PROJECT_ID: link.projectId,
    },
  });

  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stdout).not.toContain('Linked to');
});

test('deploy shows notice when project in `.vercel` does not exists', async () => {
  const directory = fixture('static-deployment');

  // overwrite .vercel with unexisting project
  await ensureDir(path.join(directory, '.vercel'));
  await writeFile(
    path.join(directory, '.vercel/project.json'),
    JSON.stringify({
      orgId: 'asdf',
      projectId: 'asdf',
    })
  );

  const now = execute([directory]);

  let detectedNotice = false;

  // kill after first prompt
  await waitForPrompt(now, chunk => {
    detectedNotice =
      detectedNotice ||
      chunk.includes(
        'Your Project was either deleted, transferred to a new Team, or you don’t have access to it anymore'
      );

    return /Set up and deploy [^?]+\?/.test(chunk);
  });
  now.stdin.write('no\n');

  expect(detectedNotice, 'detectedNotice').toBe(true);
});

test('use `rootDirectory` from project when deploying', async () => {
  const directory = fixture('project-root-directory');

  const firstResult = await execute([directory, '--yes', '--public']);
  expect(firstResult.exitCode, formatOutput(firstResult)).toBe(0);

  const { host: firstHost } = new URL(firstResult.stdout);
  const response = await apiFetch(`/v12/now/deployments/get?url=${firstHost}`);
  expect(response.status).toBe(200);
  const { projectId } = await response.json();
  expect(typeof projectId).toBe('string');

  const projectResponse = await apiFetch(`/v2/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      rootDirectory: 'src',
    }),
  });

  expect(projectResponse.status, await projectResponse.text()).toBe(200);

  const secondResult = await execute([directory, '--public']);
  expect(secondResult.exitCode, formatOutput(secondResult)).toBe(0);

  const pageResponse1 = await fetch(secondResult.stdout);
  expect(pageResponse1.status).toBe(200);
  expect(await pageResponse1.text()).toMatch(/I am a website/gm);

  // Ensures that the `now.json` file has been applied
  const pageResponse2 = await fetch(`${secondResult.stdout}/i-do-exist`);
  expect(pageResponse2.status).toBe(200);
  expect(await pageResponse2.text()).toMatch(/I am a website/gm);

  await apiFetch(`/v2/projects/${projectId}`, {
    method: 'DELETE',
  });
});

test('vercel deploy with unknown `VERCEL_ORG_ID` or `VERCEL_PROJECT_ID` should error', async () => {
  const output = await execute(['deploy'], {
    env: { VERCEL_ORG_ID: 'asdf', VERCEL_PROJECT_ID: 'asdf' },
  });

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toContain('Project not found');
});

test('vercel env with unknown `VERCEL_ORG_ID` or `VERCEL_PROJECT_ID` should error', async () => {
  const output = await execute(['env'], {
    env: { VERCEL_ORG_ID: 'asdf', VERCEL_PROJECT_ID: 'asdf' },
  });

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toContain('Project not found');
});

test('whoami with `VERCEL_ORG_ID` should favor `--scope` and should error', async () => {
  if (!token) {
    throw new Error('Shared state "token" not set.');
  }

  const user = await fetchTokenInformation(token);

  const output = await execute(['whoami', '--scope', 'asdf'], {
    env: { VERCEL_ORG_ID: user.id },
  });

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toContain('The specified scope does not exist');
});

test('whoami with local .vercel scope', async () => {
  if (!token) {
    throw new Error('Shared state "token" not set.');
  }

  const directory = fixture('static-deployment');
  const user = await fetchTokenInformation(token);

  // create local .vercel
  await ensureDir(path.join(directory, '.vercel'));
  await fs.writeFile(
    path.join(directory, '.vercel', 'project.json'),
    JSON.stringify({ orgId: user.id, projectId: 'xxx' })
  );

  const output = await execute(['whoami'], {
    cwd: directory,
  });

  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stdout).toContain(contextName);

  // clean up
  await remove(path.join(directory, '.vercel'));
});

test('deploys with only now.json and README.md', async () => {
  const directory = fixture('deploy-with-only-readme-now-json');

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    [...defaultArgs, '--yes'],
    {
      cwd: directory,
      reject: false,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  const { host } = new URL(stdout);
  const res = await fetch(`https://${host}/README.md`);
  const text = await res.text();
  expect(text).toMatch(/readme contents/);
});

test('deploys with only vercel.json and README.md', async () => {
  const directory = fixture('deploy-with-only-readme-vercel-json');

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    [...defaultArgs, '--yes'],
    {
      cwd: directory,
      reject: false,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  const { host } = new URL(stdout);
  const res = await fetch(`https://${host}/README.md`);
  const text = await res.text();
  expect(text).toMatch(/readme contents/);
});

test('reject conflicting `vercel.json` and `now.json` files', async () => {
  const directory = fixture('conflicting-now-json-vercel-json');

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    [...defaultArgs, '--yes'],
    {
      cwd: directory,
      reject: false,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(stderr).toContain(
    'Cannot use both a `vercel.json` and `now.json` file. Please delete the `now.json` file.'
  );
});

test('`vc --debug project ls` should output the projects listing', async () => {
  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    [...defaultArgs, '--debug', 'project', 'ls'],
    {
      reject: false,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  expect(stderr).toContain('> Projects found under');
});

test(
  'deploy gatsby twice and print cached directories',
  async () => {
    const directory = example('gatsby');
    const packageJsonPath = path.join(directory, 'package.json');
    const packageJsonOriginal = await readFile(packageJsonPath, 'utf8');
    const pkg = JSON.parse(packageJsonOriginal) as PackageJson;
    if (!pkg.scripts) {
      throw new Error(`"scripts" not found in "${packageJsonPath}"`);
    }

    async function tryDeploy(cwd: string) {
      const { exitCode, stdout, stderr } = await execa(
        binaryPath,
        [...defaultArgs, '--public', '--yes'],
        {
          cwd,
          stdio: 'inherit',
          reject: false,
        }
      );

      expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
    }

    // Deploy once to populate the cache
    await tryDeploy(directory);

    // Wait because the cache is not available right away
    // See https://codeburst.io/quick-explanation-of-the-s3-consistency-model-6c9f325e3f82
    await sleep(60000);

    // Update build script to ensure cached files were restored in the next deploy
    pkg.scripts.build = `ls -lA && ls .cache && ls public && ${pkg.scripts.build}`;
    await writeFile(packageJsonPath, JSON.stringify(pkg));
    try {
      await tryDeploy(directory);
    } finally {
      await writeFile(packageJsonPath, packageJsonOriginal);
    }
  },
  6 * 60 * 1000
);

test('deploy pnpm twice using pnp and symlink=false', async () => {
  const directory = path.join(__dirname, 'fixtures/unit/pnpm-pnp-symlink');

  await remove(path.join(directory, '.vercel'));

  function deploy() {
    return execa(binaryPath, [
      directory,
      '--name',
      session,
      ...defaultArgs,
      '--public',
      '--yes',
    ]);
  }

  let { exitCode, stdout, stderr } = await deploy();
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  let page = await fetch(stdout);
  let text = await page.text();
  expect(text).toBe('no cache\n');

  ({ exitCode, stdout, stderr } = await deploy());
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  page = await fetch(stdout);
  text = await page.text();

  expect(text).toBe('cache exists\n');
});

test('reject deploying with wrong team .vercel config', async () => {
  const directory = fixture('unauthorized-vercel-config');

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    [...defaultArgs, '--yes'],
    {
      cwd: directory,
      reject: false,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(stderr).toContain(
    'Could not retrieve Project Settings. To link your Project, remove the `.vercel` directory and deploy again.'
  );
});

test('reject deploying with invalid token', async () => {
  const directory = fixture('unauthorized-vercel-config');
  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    [...defaultArgs, '--yes'],
    {
      cwd: directory,
      reject: false,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(stderr).toMatch(
    /Error: Could not retrieve Project Settings\. To link your Project, remove the `\.vercel` directory and deploy again\./g
  );
});

test('[vc link] should show prompts to set up project', async () => {
  const dir = fixture('project-link-zeroconf');
  const projectName = `project-link-zeroconf-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const vc = execa(binaryPath, ['link', ...defaultArgs], {
    cwd: dir,
    env: {
      FORCE_TTY: '1',
    },
  });

  await setupProject(vc, projectName, {
    buildCommand: `mkdir -p o && echo '<h1>custom hello</h1>' > o/index.html`,
    outputDirectory: 'o',
  });

  const output = await vc;

  // Ensure the exit code is right
  expect(output.exitCode, formatOutput(output)).toBe(0);

  // Ensure .gitignore is created
  const gitignore = await readFile(path.join(dir, '.gitignore'), 'utf8');
  expect(gitignore).toBe('.vercel\n');

  // Ensure .vercel/project.json and .vercel/README.txt are created
  expect(
    fs.existsSync(path.join(dir, '.vercel', 'project.json')),
    'project.json'
  ).toBe(true);
  expect(
    fs.existsSync(path.join(dir, '.vercel', 'README.txt')),
    'README.txt'
  ).toBe(true);
});

test('[vc link --yes] should not show prompts and autolink', async () => {
  const dir = fixture('project-link-confirm');

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    ['link', '--yes', ...defaultArgs],
    { cwd: dir, reject: false }
  );

  // Ensure the exit code is right
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  // Ensure the message is correct pattern
  expect(stderr).toMatch(/Linked to /m);

  // Ensure .gitignore is created
  const gitignore = await readFile(path.join(dir, '.gitignore'), 'utf8');
  expect(gitignore).toBe('.vercel\n');

  // Ensure .vercel/project.json and .vercel/README.txt are created
  expect(
    fs.existsSync(path.join(dir, '.vercel', 'project.json')),
    'project.json'
  ).toBe(true);
  expect(
    fs.existsSync(path.join(dir, '.vercel', 'README.txt')),
    'README.txt'
  ).toBe(true);
});

test('[vc link] should not duplicate paths in .gitignore', async () => {
  const dir = fixture('project-link-gitignore');

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const { exitCode, stdout, stderr } = await execa(
    binaryPath,
    ['link', '--yes', ...defaultArgs],
    {
      cwd: dir,
      reject: false,
      env: {
        FORCE_TTY: '1',
      },
    }
  );

  // Ensure the exit code is right
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  // Ensure the message is correct pattern
  expect(stderr).toMatch(/Linked to /m);

  // Ensure .gitignore is created
  const gitignore = await readFile(path.join(dir, '.gitignore'), 'utf8');
  expect(gitignore).toBe('.vercel\n');
});

test('[vc dev] should show prompts to set up project', async () => {
  const dir = fixture('project-link-dev');
  const port = 58352;
  const projectName = `project-link-dev-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const dev = execa(
    binaryPath,
    ['dev', '--listen', port.toString(), ...defaultArgs],
    {
      cwd: dir,
      env: {
        FORCE_TTY: '1',
      },
    }
  );

  await setupProject(dev, projectName, {
    buildCommand: `mkdir -p o && echo '<h1>custom hello</h1>' > o/index.html`,
    outputDirectory: 'o',
  });

  // Ensure .gitignore is created
  const gitignore = await readFile(path.join(dir, '.gitignore'), 'utf8');
  expect(gitignore).toBe('.vercel\n');

  // Ensure .vercel/project.json and .vercel/README.txt are created
  expect(
    fs.existsSync(path.join(dir, '.vercel', 'project.json')),
    'project.json'
  ).toBe(true);
  expect(
    fs.existsSync(path.join(dir, '.vercel', 'README.txt')),
    'README.txt'
  ).toBe(true);

  await waitForPrompt(dev, chunk => chunk.includes('Ready! Available at'));

  // Ensure that `vc dev` also works
  try {
    const response = await fetch(`http://localhost:${port}/`);
    const text = await response.text();
    expect(text).toContain('<h1>custom hello</h1>');
  } finally {
    process.kill(dev.pid, 'SIGTERM');
  }
});

test('[vc link] should show project prompts but not framework when `builds` defined', async () => {
  const dir = fixture('project-link-legacy');
  const projectName = `project-link-legacy-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const vc = execa(binaryPath, ['link', ...defaultArgs], {
    cwd: dir,
    env: {
      FORCE_TTY: '1',
    },
  });

  await waitForPrompt(vc, chunk => /Set up [^?]+\?/.test(chunk));
  vc.stdin.write('yes\n');

  await waitForPrompt(vc, chunk =>
    chunk.includes('Which scope should contain your project?')
  );
  vc.stdin.write('\n');

  await waitForPrompt(vc, chunk => chunk.includes('Link to existing project?'));
  vc.stdin.write('no\n');

  await waitForPrompt(vc, chunk =>
    chunk.includes('What’s your project’s name?')
  );
  vc.stdin.write(`${projectName}\n`);

  await waitForPrompt(vc, chunk =>
    chunk.includes('In which directory is your code located?')
  );
  vc.stdin.write('\n');

  await waitForPrompt(vc, chunk => chunk.includes('Linked to'));

  const output = await vc;

  // Ensure the exit code is right
  expect(output.exitCode, formatOutput(output)).toBe(0);

  // Ensure .gitignore is created
  const gitignore = await readFile(path.join(dir, '.gitignore'), 'utf8');
  expect(gitignore).toBe('.vercel\n');

  // Ensure .vercel/project.json and .vercel/README.txt are created
  expect(
    fs.existsSync(path.join(dir, '.vercel', 'project.json')),
    'project.json'
  ).toBe(true);
  expect(
    fs.existsSync(path.join(dir, '.vercel', 'README.txt')),
    'README.txt'
  ).toBe(true);
});

test('[vc dev] should send the platform proxy request headers to frontend dev server ', async () => {
  const dir = fixture('dev-proxy-headers-and-env');
  const port = 58353;
  const projectName = `dev-proxy-headers-and-env-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const dev = execa(
    binaryPath,
    ['dev', '--listen', port.toString(), ...defaultArgs],
    {
      cwd: dir,
      env: {
        FORCE_TTY: '1',
      },
    }
  );

  await setupProject(dev, projectName, {
    buildCommand: `mkdir -p o && echo '<h1>custom hello</h1>' > o/index.html`,
    outputDirectory: 'o',
    devCommand: 'node server.js',
  });

  await waitForPrompt(dev, chunk => chunk.includes('Ready! Available at'));

  // Ensure that `vc dev` also works
  try {
    const response = await fetch(`http://localhost:${port}/`);
    const body = await response.json();
    expect(body.headers['x-vercel-deployment-url']).toBe(`localhost:${port}`);
    expect(body.env.NOW_REGION).toBe('dev1');
  } finally {
    process.kill(dev.pid, 'SIGTERM');
  }
});

test('[vc link] should support the `--project` flag', async () => {
  if (!token) {
    throw new Error('Shared state "token" not set.');
  }

  const projectName = 'link-project-flag';
  const directory = fixture('static-deployment');

  const [user, output] = await Promise.all([
    fetchTokenInformation(token),
    execute(['link', '--yes', '--project', projectName, directory]),
  ]);

  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toContain(`Linked to ${user.username}/${projectName}`);
});

test('[vc build] should build project with `@vercel/static-build`', async () => {
  const directory = fixture('vc-build-static-build');
  const output = await execute(['build'], { cwd: directory });
  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toContain('Build Completed in .vercel/output');

  expect(
    await fs.readFile(
      path.join(directory, '.vercel/output/static/index.txt'),
      'utf8'
    )
  ).toBe('hi\n');

  const config = await fs.readJSON(
    path.join(directory, '.vercel/output/config.json')
  );
  expect(config.version).toBe(3);

  const builds = await fs.readJSON(
    path.join(directory, '.vercel/output/builds.json')
  );
  expect(builds.target).toBe('preview');
  expect(builds.builds[0].src).toBe('package.json');
  expect(builds.builds[0].use).toBe('@vercel/static-build');
});

test('[vc build] should not include .vercel when distDir is "."', async () => {
  const directory = fixture('static-build-dist-dir');
  const output = await execute(['build'], { cwd: directory });
  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toContain('Build Completed in .vercel/output');
  const dir = await fs.readdir(path.join(directory, '.vercel/output/static'));
  expect(dir).not.toContain('.vercel');
  expect(dir).toContain('index.txt');
});

test('[vc build] should not include .vercel when zeroConfig is true and outputDirectory is "."', async () => {
  const directory = fixture('static-build-zero-config-output-directory');
  const output = await execute(['build'], { cwd: directory });
  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toContain('Build Completed in .vercel/output');
  const dir = await fs.readdir(path.join(directory, '.vercel/output/static'));
  expect(dir).not.toContain('.vercel');
  expect(dir).toContain('index.txt');
});

test('vercel.json configuration overrides in a new project prompt user and merges settings correctly', async () => {
  const directory = fixture(
    'vercel-json-configuration-overrides-merging-prompts'
  );

  // remove previously linked project if it exists
  await remove(path.join(directory, '.vercel'));

  const vc = execa(binaryPath, [directory, ...defaultArgs], { reject: false });

  await waitForPrompt(vc, chunk => chunk.includes('Set up and deploy'));
  vc.stdin.write('y\n');
  await waitForPrompt(vc, chunk =>
    chunk.includes('Which scope do you want to deploy to?')
  );
  vc.stdin.write('\n');
  await waitForPrompt(vc, chunk => chunk.includes('Link to existing project?'));
  vc.stdin.write('n\n');
  await waitForPrompt(vc, chunk =>
    chunk.includes('What’s your project’s name?')
  );
  vc.stdin.write('\n');
  await waitForPrompt(vc, chunk =>
    chunk.includes('In which directory is your code located?')
  );
  vc.stdin.write('\n');
  await waitForPrompt(vc, chunk =>
    chunk.includes('Want to modify these settings?')
  );
  vc.stdin.write('y\n');
  await waitForPrompt(vc, chunk =>
    chunk.includes(
      'Which settings would you like to overwrite (select multiple)?'
    )
  );
  vc.stdin.write('a\n');
  await waitForPrompt(vc, chunk =>
    chunk.includes("What's your Development Command?")
  );
  vc.stdin.write('echo "DEV COMMAND"\n');
  // the crux of this test is to make sure that the outputDirectory is properly set by the prompts.
  // otherwise the output from the build command will not be the index route and the page text assertion below will fail.
  await waitForPrompt(vc, chunk =>
    chunk.includes("What's your Output Directory?")
  );
  vc.stdin.write('output\n');
  await waitForPrompt(vc, chunk => chunk.includes('Linked to'));
  const deployment = await vc;
  expect(deployment.exitCode, formatOutput(deployment)).toBe(0);
  // assert the command were executed
  let page = await fetch(deployment.stdout);
  let text = await page.text();
  expect(text).toBe('1\n');
});

test('vercel.json configuration overrides in an existing project do not prompt user and correctly apply overrides', async () => {
  // create project directory and get path to vercel.json
  const directory = fixture('vercel-json-configuration-overrides');
  const vercelJsonPath = path.join(directory, 'vercel.json');

  async function deploy(autoConfirm = false) {
    const deployment = await execa(
      binaryPath,
      [directory, ...defaultArgs, '--public'].concat(
        autoConfirm ? ['--yes'] : []
      ),
      { reject: false }
    );
    expect(deployment.exitCode, formatOutput(deployment)).toBe(0);
    return deployment;
  }

  // Step 1. Create a simple static deployment with no configuration.
  // Deployment should succeed and page should display "0"

  await mkdir(path.join(directory, 'public'));
  await writeFile(path.join(directory, 'public/index.txt'), '0');

  // auto-confirm this deployment
  let deployment = await deploy(true);

  let page = await fetch(deployment.stdout);
  let text = await page.text();
  expect(text).toBe('0');

  // Step 2. Now that the project exists, override the buildCommand and outputDirectory.
  // The CLI should not prompt the user about the overrides.

  const BUILD_COMMAND = 'mkdir output && echo "1" >> output/index.txt';
  const OUTPUT_DIRECTORY = 'output';

  await writeFile(
    vercelJsonPath,
    JSON.stringify({
      buildCommand: BUILD_COMMAND,
      outputDirectory: OUTPUT_DIRECTORY,
    })
  );

  deployment = await deploy();
  page = await fetch(deployment.stdout);
  text = await page.text();
  expect(text).toBe('1\n');

  // // Step 3. Do a more complex deployment using a framework this time
  await mkdir(`${directory}/pages`);
  await writeFile(
    `${directory}/pages/index.js`,
    `export default () => 'Next.js Test'`
  );
  await writeFile(
    vercelJsonPath,
    JSON.stringify({
      framework: 'nextjs',
    })
  );
  await writeFile(
    `${directory}/package.json`,
    JSON.stringify({
      scripts: {
        dev: 'next',
        start: 'next start',
        build: 'next build',
      },
      dependencies: {
        next: 'latest',
        react: 'latest',
        'react-dom': 'latest',
      },
    })
  );

  deployment = await deploy();
  page = await fetch(deployment.stdout);
  text = await page.text();
  expect(text).toMatch(/Next\.js Test/);
});
