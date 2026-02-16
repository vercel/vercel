import path from 'path';
import { execCli } from './helpers/exec';
import { apiFetch } from './helpers/api-fetch';
import fs from 'fs-extra';
import sleep from '../src/util/sleep';
import waitForPrompt from './helpers/wait-for-prompt';
import { listTmpDirs } from './helpers/get-tmp-dir';
import { teamPromise } from './helpers/get-account';
import {
  setupE2EFixture,
  prepareE2EFixtures,
} from './helpers/setup-e2e-fixture';
import formatOutput from './helpers/format-output';
import type { CLIProcess } from './helpers/types';
import { randomBytes } from 'crypto';

const TEST_TIMEOUT = 3 * 60 * 1000;
jest.setTimeout(TEST_TIMEOUT);

const binaryPath = path.resolve(__dirname, '../scripts/start.js');

async function vcLink(projectPath: string) {
  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    ['link', '--yes'],
    {
      cwd: projectPath,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
}

async function getLocalhost(vc: CLIProcess): Promise<RegExpExecArray> {
  let localhost: RegExpExecArray | undefined;
  await waitForPrompt(
    vc,
    chunk => {
      const line = chunk.toString();
      if (line.includes('Ready! Available at')) {
        localhost = /(https?:[^\s]+)/g.exec(line) || undefined;
        return true;
      }
      return false;
    },
    5000
  );

  // This should never happen because waitForPrompt will time out
  // and never return here in this case, but extra checking is fine
  // and it makes typescript happy
  if (!localhost) {
    throw new Error('Localhost not found!');
  }

  return localhost;
}

beforeAll(async () => {
  try {
    const team = await teamPromise;
    await prepareE2EFixtures(team.slug, binaryPath);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log('Failed test suite `beforeAll`');
    // eslint-disable-next-line no-console
    console.log(err);

    // force test suite to actually stop
    process.exit(1);
  }
});

afterAll(async () => {
  delete process.env.ENABLE_EXPERIMENTAL_COREPACK;

  const allTmpDirs = listTmpDirs();
  for (const tmpDir of allTmpDirs) {
    // eslint-disable-next-line no-console
    console.log('Removing temp dir: ', tmpDir.name);
    tmpDir.removeCallback();
  }
});

test('default command should deploy directory', async () => {
  const projectDir = await setupE2EFixture('deploy-default-with-sub-directory');
  const target = 'output';

  await vcLink(path.join(projectDir, target));

  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    [
      // omit the default "deploy" command
      target,
    ],
    {
      cwd: projectDir,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  expect(stdout).toMatch(/https:\/\/output-.+\.vercel\.app/);
});

test('default command should warn when deploying with conflicting subdirectory', async () => {
  const projectDir = await setupE2EFixture(
    'deploy-default-with-conflicting-sub-directory'
  );
  const target = 'list'; // command that conflicts with a sub directory

  await vcLink(projectDir);

  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    [
      // omit the default "deploy" command
      target,
    ],
    {
      cwd: projectDir,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  expect(stderr || '').toMatch(
    /Did you mean to deploy the subdirectory "list"\? Use `vc --cwd list` instead./
  );

  const listHeader = /No deployments found/;
  expect(stderr || '').toMatch(listHeader); // ensure `list` command still ran
});

test('deploy command should not warn when deploying with conflicting subdirectory and using --cwd', async () => {
  const projectDir = await setupE2EFixture(
    'deploy-default-with-conflicting-sub-directory'
  );
  const target = 'list'; // command that conflicts with a sub directory

  await vcLink(path.join(projectDir, target));

  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    ['list', '--cwd', target],
    {
      cwd: projectDir,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  expect(stderr).not.toMatch(
    /Did you mean to deploy the subdirectory "list"\? Use `vc --cwd list` instead./
  );

  // ensure `list` command still ran
  try {
    // If it's a new Project without any deployments
    expect(stderr).toContain('No deployments found');
  } catch {
    // If it's an existing Project with deployments
    expect(stderr).toMatch(new RegExp(`Deployments for .*/${target}`));
  }
});

test('default command should work with --cwd option', async () => {
  const projectDir = await setupE2EFixture(
    'deploy-default-with-conflicting-sub-directory'
  );
  const target = 'list'; // command that conflicts with a sub directory

  await vcLink(path.join(projectDir, 'list'));

  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    [
      // omit the default "deploy" command
      '--cwd',
      target,
    ],
    {
      cwd: projectDir,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  const url = stdout;

  const deploymentResult = await fetch(`${url}/README.md`);
  const body = await deploymentResult.text();
  expect(body).toEqual(
    'readme contents for deploy-default-with-conflicting-sub-directory'
  );
});

test('should allow deploying a directory that was built with a target environment of "preview" and `--prebuilt` is used without specifying a target', async () => {
  const projectDir = await setupE2EFixture(
    'deploy-default-with-prebuilt-preview'
  );

  await vcLink(projectDir);

  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    [
      // omit the default "deploy" command
      '--prebuilt',
    ],
    {
      cwd: projectDir,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  const url = stdout;

  const deploymentResult = await fetch(`${url}/README.md`);
  const body = await deploymentResult.text();
  expect(body).toEqual(
    'readme contents for deploy-default-with-prebuilt-preview'
  );
});

test('should allow deploying a directory that was prebuilt, but has no builds.json', async () => {
  const projectDir = await setupE2EFixture('build-output-api-raw');

  await vcLink(projectDir);

  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    [
      // omit the default "deploy" command
      '--prebuilt',
    ],
    {
      cwd: projectDir,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  const url = stdout;

  const deploymentResult = await fetch(`${url}/README.md`);
  const body = await deploymentResult.text();
  expect(body).toEqual('readme contents for build-output-api-raw');
});

test('should deploy and not wait for completion', async () => {
  const projectDir = await setupE2EFixture('static-deployment');

  await vcLink(projectDir);

  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    [
      // omit the default "deploy" command
      '--no-wait',
    ],
    {
      cwd: projectDir,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  expect(stderr).toMatch(/Note: Deployment is still processing/);
});

test('[vc link] with vercel.json configuration overrides should create a valid deployment', async () => {
  const directory = await setupE2EFixture(
    'vercel-json-configuration-overrides-link'
  );

  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    ['link', '--yes'],
    {
      cwd: directory,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  const link = require(path.join(directory, '.vercel/project.json'));

  const resEnv = await apiFetch(`/v4/projects/${link.projectId}`);

  expect(resEnv.status).toBe(200);

  const json = await resEnv.json();

  expect(json.buildCommand).toBe('mkdir public && echo "1" > public/index.txt');
});

test('deploy using only now.json with `redirects` defined', async () => {
  const target = await setupE2EFixture('redirects-v2');

  const { exitCode, stdout, stderr } = await execCli(binaryPath, [
    target,
    '--yes',
  ]);

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  const url = stdout;
  const res = await fetch(`${url}/foo/bar`, { redirect: 'manual' });
  const location = res.headers.get('location');
  expect(location).toBe('https://example.com/foo/bar');
});

test('deploy using --local-config flag v2', async () => {
  const team = await teamPromise;
  const target = await setupE2EFixture('local-config-v2');
  const configPath = path.join(target, 'vercel-test.json');

  const { exitCode, stdout, stderr } = await execCli(binaryPath, [
    'deploy',
    target,
    '--local-config',
    configPath,
    '--yes',
  ]);

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  const { host } = new URL(stdout);
  expect(host).toMatch(/secondary/gm);

  const testRes = await fetch(`https://${host}/test-${team.slug}.html`);
  const testText = await testRes.text();
  expect(testText).toBe('<h1>hello test</h1>');

  const anotherTestRes = await fetch(`https://${host}/another-test`);
  const anotherTestText = await anotherTestRes.text();
  expect(anotherTestText).toBe(testText);

  const mainRes = await fetch(`https://${host}/main-${team.slug}.html`);
  expect(mainRes.status).toBe(404);

  const anotherMainRes = await fetch(`https://${host}/another-main`);
  expect(anotherMainRes.status).toBe(404);
});

test('deploy fails using --local-config flag with non-existent path', async () => {
  const target = await setupE2EFixture('local-config-v2');

  const { exitCode, stdout, stderr } = await execCli(binaryPath, [
    'deploy',
    target,
    '--local-config',
    'does-not-exist.json',
    '--yes',
  ]);

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);

  expect(stderr).toMatch(
    /Error: Couldn't find a project configuration file at/
  );
  expect(stderr).toMatch(/does-not-exist\.json/);
});

test('deploy from a nested directory', async () => {
  const root = await setupE2EFixture('zero-config-next-js-nested');
  const projectName = `project-link-dev-${
    Math.random().toString(36).split('.')[1]
  }`;

  const vc = execCli(binaryPath, ['deploy', `--name=${projectName}`], {
    cwd: root,
    env: {
      FORCE_TTY: '1',
    },
  });

  await waitForPrompt(vc, /Set up and deploy[^?]+\?/);
  vc.stdin?.write('yes\n');

  await waitForPrompt(vc, 'Which scope should contain your project?');
  vc.stdin?.write('\n');

  await waitForPrompt(vc, 'Link to existing project?');
  vc.stdin?.write('no\n');

  await waitForPrompt(vc, `What’s your project’s name? (${projectName})`);
  vc.stdin?.write(`\n`);

  await waitForPrompt(vc, 'In which directory is your code located?');
  vc.stdin?.write('app\n');

  // This means the framework detection worked!
  await waitForPrompt(vc, 'Auto-detected Project Settings for Next.js');

  vc.kill();
});

test('deploy from a nested directory with `--archive=tgz` option', async () => {
  const root = await setupE2EFixture('zero-config-next-js-nested');
  const projectName = `project-link-dev-${
    Math.random().toString(36).split('.')[1]
  }`;

  const vc = execCli(
    binaryPath,
    ['deploy', '--archive=tgz', `--name=${projectName}`],
    {
      cwd: root,
      env: {
        FORCE_TTY: '1',
      },
    }
  );

  await waitForPrompt(vc, /Set up and deploy[^?]+\?/);
  vc.stdin?.write('yes\n');

  await waitForPrompt(vc, 'Which scope should contain your project?');
  vc.stdin?.write('\n');

  await waitForPrompt(vc, 'Link to existing project?');
  vc.stdin?.write('no\n');

  await waitForPrompt(vc, `What’s your project’s name? (${projectName})`);
  vc.stdin?.write(`\n`);

  await waitForPrompt(vc, 'In which directory is your code located?');
  vc.stdin?.write('app\n');

  // This means the framework detection worked!
  await waitForPrompt(vc, 'Auto-detected Project Settings for Next.js');

  vc.kill();
});

test('deploy using --local-config flag above target', async () => {
  const root = await setupE2EFixture('local-config-above-target');
  const target = path.join(root, 'dir');

  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    ['deploy', target, '--local-config', './now-root.json', '--yes'],
    {
      cwd: root,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  const { host } = new URL(stdout);

  const testRes = await fetch(`https://${host}/index.html`);
  const testText = await testRes.text();
  expect(testText).toBe('<h1>hello index</h1>');

  const anotherTestRes = await fetch(`https://${host}/another.html`);
  const anotherTestText = await anotherTestRes.text();
  expect(anotherTestText).toBe('<h1>hello another</h1>');

  expect(host).toMatch(/root-level/gm);
});

// eslint-disable-next-line jest/no-disabled-tests
test.skip('deploy `api-env` fixture and test `vercel env` command', async () => {
  const target = await setupE2EFixture('api-env');
  // Randomness is required so that tests can run in
  // parallel on the same project
  const promptEnvVar = `VAR_${randomBytes(8).toString('hex')}`;
  const stdinEnvVar = `VAR_${randomBytes(8).toString('hex')}`;
  const previewEnvVar = `VAR_${randomBytes(8).toString('hex')}`;

  async function vcLink() {
    const { exitCode, stdout, stderr } = await execCli(
      binaryPath,
      ['link', '--yes'],
      {
        cwd: target,
      }
    );
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  async function vcEnvLsDoesNotIncludeVars() {
    const { exitCode, stdout, stderr } = await execCli(
      binaryPath,
      ['env', 'ls'],
      {
        cwd: target,
      }
    );

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
    expect(stdout).not.toContain(previewEnvVar);
    expect(stdout).not.toContain(stdinEnvVar);
    expect(stdout).not.toContain(promptEnvVar);
  }

  async function vcEnvAddWithPrompts() {
    const vc = execCli(binaryPath, ['env', 'add'], {
      cwd: target,
    });

    await waitForPrompt(vc, "What's the name of the variable?");
    vc.stdin?.write(`${promptEnvVar}\n`);
    await waitForPrompt(vc, 'Mark as sensitive?');
    vc.stdin?.write('n\n');
    await waitForPrompt(
      vc,
      chunk =>
        chunk.includes("What's the value of") && chunk.includes(promptEnvVar)
    );
    vc.stdin?.write('my plaintext value\n');

    await waitForPrompt(
      vc,
      chunk =>
        chunk.includes('which Environments') && chunk.includes(promptEnvVar)
    );
    vc.stdin?.write('a\n'); // select all

    const { exitCode, stdout, stderr } = await vc;

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  async function vcEnvAddFromStdin() {
    const vc = execCli(binaryPath, ['env', 'add', stdinEnvVar, 'development'], {
      cwd: target,
    });
    vc.stdin?.end('{"expect":"quotes"}');
    const { exitCode, stdout, stderr } = await vc;
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  async function vcEnvAddFromStdinPreview() {
    const vc = execCli(binaryPath, ['env', 'add', previewEnvVar, 'preview'], {
      cwd: target,
    });
    vc.stdin?.end('preview-no-branch');
    const { exitCode, stdout, stderr } = await vc;
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  async function vcEnvAddFromStdinPreviewWithBranch() {
    const vc = execCli(
      binaryPath,
      ['env', 'add', previewEnvVar, 'preview', 'staging'],
      {
        cwd: target,
      }
    );
    vc.stdin?.end('preview-with-branch');
    const { exitCode, stdout, stderr } = await vc;
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
    expect(stderr).toMatch(/does not have a connected Git repository/gm);
  }

  async function vcEnvLsIncludesVar() {
    const { exitCode, stderr, stdout } = await execCli(
      binaryPath,
      ['env', 'ls'],
      {
        cwd: target,
      }
    );

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
    expect(stderr).toMatch(/Environment Variables found for (.*)\/api-env/gm);

    const lines = stdout.split('\n');

    const plaintextEnvs = lines.filter(line => line.includes(promptEnvVar));
    expect(plaintextEnvs.length).toBe(1);
    expect(plaintextEnvs[0]).toMatch(/Production, Preview, Development/gm);

    const stdinEnvs = lines.filter(line => line.includes(stdinEnvVar));
    expect(stdinEnvs.length).toBe(1);
    expect(stdinEnvs[0]).toMatch(/Development/gm);

    const previewEnvs = lines.filter(line => line.includes(previewEnvVar));
    expect(previewEnvs.length).toBe(1);
    expect(previewEnvs[0]).toMatch(/Encrypted .* Preview /gm);
  }

  async function vcEnvPull() {
    const { exitCode, stdout, stderr } = await execCli(
      binaryPath,
      ['env', 'pull', '-y'],
      {
        cwd: target,
      }
    );

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
    expect(stderr).toMatch(/Updated .env.local file/gm);

    const contents = fs.readFileSync(path.join(target, '.env.local'), 'utf8');
    expect(contents).toMatch(/^# Created by Vercel CLI\n/);
    expect(contents).toMatch(
      new RegExp(`${promptEnvVar}="my plaintext value"`)
    );
    expect(contents).toMatch(
      new RegExp(`${stdinEnvVar}="{"expect":"quotes"}"`)
    );
    expect(contents).not.toMatch(new RegExp(`${previewEnvVar}`));
  }

  async function vcEnvPullOverwrite() {
    const { exitCode, stdout, stderr } = await execCli(
      binaryPath,
      ['env', 'pull'],
      {
        cwd: target,
      }
    );

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
    expect(stderr).toMatch(/Overwriting existing .env.local file/gm);
    expect(stderr).toMatch(/Updated .env.local file/gm);
  }

  async function vcEnvPullConfirm() {
    fs.writeFileSync(path.join(target, '.env.local'), 'hahaha');

    const vc = execCli(binaryPath, ['env', 'pull'], {
      cwd: target,
      env: {
        FORCE_TTY: '1',
      },
    });

    await waitForPrompt(
      vc,
      'Found existing file ".env.local". Do you want to overwrite?'
    );
    vc.stdin?.end('y\n');

    const { exitCode, stdout, stderr } = await vc;
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  async function vcDeployWithVar() {
    const { exitCode, stdout, stderr } = await execCli(binaryPath, [], {
      cwd: target,
    });
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
    const { host } = new URL(stdout);

    const apiUrl = `https://${host}/api/get-env`;
    const apiRes = await fetch(apiUrl);
    expect(apiRes.status, apiUrl).toBe(200);
    const apiJson = await apiRes.json();
    expect(apiJson[promptEnvVar]).toBe('my plaintext value');

    const homeUrl = `https://${host}`;
    const homeRes = await fetch(homeUrl);
    expect(homeRes.status, homeUrl).toBe(200);
    const homeJson = await homeRes.json();
    expect(homeJson[promptEnvVar]).toBe('my plaintext value');
  }

  async function vcDevWithEnv() {
    const vc = execCli(binaryPath, ['dev', '--debug'], {
      cwd: target,
    });

    const localhost = await getLocalhost(vc);
    const apiUrl = `${localhost[0]}/api/get-env`;
    const apiRes = await fetch(apiUrl);

    expect(apiRes.status).toBe(200);

    const apiJson = await apiRes.json();

    expect(apiJson[promptEnvVar]).toBe('my plaintext value');

    const homeUrl = localhost[0];

    const homeRes = await fetch(homeUrl);
    const homeJson = await homeRes.json();
    expect(homeJson[promptEnvVar]).toBe('my plaintext value');

    // sleep before kill, otherwise the dev process doesn't clean up and exit properly
    await sleep(100);
    vc.kill('SIGTERM', { forceKillAfterTimeout: 5000 });

    const { exitCode, stdout, stderr } = await vc;
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  async function vcDevAndFetchCloudVars() {
    const vc = execCli(binaryPath, ['dev'], {
      cwd: target,
    });

    const localhost = await getLocalhost(vc);
    const apiUrl = `${localhost[0]}/api/get-env`;
    const apiRes = await fetch(apiUrl);
    expect(apiRes.status).toBe(200);

    const apiJson = await apiRes.json();
    expect(apiJson[promptEnvVar]).toBe('my plaintext value');
    expect(apiJson[stdinEnvVar]).toBe('{"expect":"quotes"}');

    const homeUrl = localhost[0];
    const homeRes = await fetch(homeUrl);
    const homeJson = await homeRes.json();
    expect(homeJson[promptEnvVar]).toBe('my plaintext value');
    expect(homeJson[stdinEnvVar]).toBe('{"expect":"quotes"}');

    // system env vars are hidden in dev
    expect(apiJson['VERCEL']).toBeUndefined();
    // though the dev server now has this
    expect(homeJson['VERCEL']).toBe('1');

    // sleep before kill, otherwise the dev process doesn't clean up and exit properly
    await sleep(100);
    vc.kill('SIGTERM', { forceKillAfterTimeout: 5000 });

    const { exitCode, stdout, stderr } = await vc;
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  async function enableAutoExposeSystemEnvs() {
    const link = require(path.join(target, '.vercel/project.json'));

    const res = await apiFetch(`/v2/projects/${link.projectId}`, {
      method: 'PATCH',
      body: JSON.stringify({ autoExposeSystemEnvs: true }),
    });

    expect(res.status).toBe(200);
    if (res.status === 200) {
      // eslint-disable-next-line no-console
      console.log(
        `Set autoExposeSystemEnvs=true for project ${link.projectId}`
      );
    }
  }

  async function vcEnvPullFetchSystemVars() {
    const { exitCode, stdout, stderr } = await execCli(
      binaryPath,
      ['env', 'pull', '-y', '--environment', 'production'],
      {
        cwd: target,
      }
    );

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

    const contents = fs.readFileSync(path.join(target, '.env.local'), 'utf8');

    const lines = new Set(contents.split('\n'));

    expect(lines).toContain('VERCEL="1"');
    expect(lines).toContain('VERCEL_URL=""');
    expect(lines).toContain('VERCEL_ENV="production"');
    expect(lines).toContain('VERCEL_GIT_PROVIDER=""');
    expect(lines).toContain('VERCEL_GIT_REPO_SLUG=""');
  }

  async function vcDevAndFetchSystemVars() {
    const vc = execCli(binaryPath, ['dev'], {
      cwd: target,
    });

    const localhost = await getLocalhost(vc);
    const apiUrl = `${localhost[0]}/api/get-env`;
    const apiRes = await fetch(apiUrl);

    const localhostNoProtocol = localhost[0].slice('http://'.length);

    const apiJson = await apiRes.json();
    // environment variables are not set in dev
    expect(apiJson['VERCEL']).toBeUndefined();
    expect(apiJson['VERCEL_ENV']).toBeUndefined();
    expect(apiJson['VERCEL_GIT_PROVIDER']).toBeUndefined();
    expect(apiJson['VERCEL_GIT_REPO_SLUG']).toBeUndefined();
    // except for these because vc dev
    expect(apiJson['VERCEL_URL']).toBe(localhostNoProtocol);
    expect(apiJson['VERCEL_REGION']).toBe('dev1');

    const homeUrl = localhost[0];
    const homeRes = await fetch(homeUrl);
    const homeJson = await homeRes.json();
    expect(homeJson['VERCEL']).toBe('1');
    expect(homeJson['VERCEL_URL']).toBe(localhostNoProtocol);
    expect(homeJson['VERCEL_ENV']).toBe('development');
    expect(homeJson['VERCEL_REGION']).toBeUndefined();
    expect(homeJson['VERCEL_GIT_PROVIDER']).toBeUndefined();
    expect(homeJson['VERCEL_GIT_REPO_SLUG']).toBeUndefined();

    // sleep before kill, otherwise the dev process doesn't clean up and exit properly
    await sleep(100);
    vc.kill('SIGTERM', { forceKillAfterTimeout: 5000 });

    const { exitCode, stdout, stderr } = await vc;
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  async function vcEnvRemove() {
    const vc = execCli(binaryPath, ['env', 'rm', '-y'], {
      cwd: target,
    });
    await waitForPrompt(vc, "What's the name of the variable?");
    vc.stdin?.write(`${previewEnvVar}\n`);
    const { exitCode, stdout, stderr } = await vc;
    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  async function vcEnvRemoveWithArgs() {
    const { exitCode, stdout, stderr } = await execCli(
      binaryPath,
      ['env', 'rm', stdinEnvVar, 'development', '-y'],
      {
        cwd: target,
      }
    );

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  async function vcEnvRemoveWithNameOnly() {
    const { exitCode, stdout, stderr } = await execCli(
      binaryPath,
      ['env', 'rm', promptEnvVar, '-y'],
      {
        cwd: target,
      }
    );

    expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  }

  function vcEnvRemoveByName(name: string) {
    return execCli(binaryPath, ['env', 'rm', name, '-y'], {
      cwd: target,
    });
  }

  async function vcEnvRemoveAll() {
    await vcEnvRemoveByName(previewEnvVar);
    await vcEnvRemoveByName(stdinEnvVar);
    await vcEnvRemoveByName(promptEnvVar);
  }

  try {
    await vcEnvRemoveAll();
    await vcLink();
    await vcEnvLsDoesNotIncludeVars();
    await vcEnvAddWithPrompts();
    await vcEnvAddFromStdin();
    await vcEnvAddFromStdinPreview();
    await vcEnvAddFromStdinPreviewWithBranch();
    await vcEnvLsIncludesVar();
    await vcEnvPull();
    await vcEnvPullOverwrite();
    await vcEnvPullConfirm();
    await vcDeployWithVar();
    await vcDevWithEnv();
    fs.unlinkSync(path.join(target, '.env.local'));
    await vcDevAndFetchCloudVars();
    await enableAutoExposeSystemEnvs();
    await vcEnvPullFetchSystemVars();
    fs.unlinkSync(path.join(target, '.env.local'));
    await vcDevAndFetchSystemVars();
    await vcEnvRemove();
    await vcEnvRemoveWithArgs();
    await vcEnvRemoveWithNameOnly();
    await vcEnvLsDoesNotIncludeVars();
  } finally {
    await vcEnvRemoveAll();
  }
});
