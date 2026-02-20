import path from 'path';
import { URL } from 'url';
import express from 'express';
import { createServer } from 'http';
import { listen } from 'async-listen';
import { apiFetch } from './helpers/api-fetch';
import fs, { writeFile, readFile, remove, ensureDir, mkdir } from 'fs-extra';
import sleep from '../src/util/sleep';
import waitForPrompt from './helpers/wait-for-prompt';
import { execCli } from './helpers/exec';
import { listTmpDirs } from './helpers/get-tmp-dir';
import { teamPromise, userPromise } from './helpers/get-account';
import {
  setupE2EFixture,
  prepareE2EFixtures,
} from './helpers/setup-e2e-fixture';
import formatOutput from './helpers/format-output';
import type { PackageJson } from '@vercel/build-utils';
import type { CLIProcess } from './helpers/types';
import stripAnsi from 'strip-ansi';

const TEST_TIMEOUT = 3 * 60 * 1000;
jest.setTimeout(TEST_TIMEOUT);

const binaryPath = path.resolve(__dirname, `../scripts/start.js`);
const example = (name: string) =>
  path.join(__dirname, '..', '..', '..', 'examples', name);
const session = Math.random().toString(36).split('.')[1];

async function setupProject(
  process: CLIProcess,
  projectName: string,
  overrides: {
    devCommand?: string;
    buildCommand?: string;
    outputDirectory?: string;
  },
  {
    vercelAuth,
  }: {
    vercelAuth: 'standard' | 'none';
  } = {
    vercelAuth: 'standard',
  }
) {
  await waitForPrompt(process, /Set up[^?]+\?/);
  process.stdin?.write('yes\n');

  await waitForPrompt(process, /Which scope [^?]+\?/);
  process.stdin?.write('\n');

  await waitForPrompt(process, 'Link to existing project?');
  process.stdin?.write('no\n');

  await waitForPrompt(process, 'What’s your project’s name?');
  process.stdin?.write(`${projectName}\n`);

  await waitForPrompt(process, 'In which directory is your code located?');
  process.stdin?.write('\n');

  await waitForPrompt(process, 'Want to modify these settings?');

  if (overrides) {
    process.stdin?.write('yes\n');

    const { buildCommand, outputDirectory, devCommand } = overrides;

    await waitForPrompt(
      process,
      'Which settings would you like to overwrite (select multiple)?'
    );
    process.stdin?.write('a\n'); // 'a' means select all

    await waitForPrompt(process, `What's your Build Command?`);
    process.stdin?.write(`${buildCommand || ''}\n`);

    await waitForPrompt(process, `What's your Development Command?`);
    process.stdin?.write(`${devCommand || ''}\n`);

    await waitForPrompt(process, `What's your Output Directory?`);
    process.stdin?.write(`${outputDirectory || ''}\n`);
  } else {
    process.stdin?.write('no\n');
  }

  const hasAdditionalProjectSettingsToChange = vercelAuth !== 'standard';
  await waitForPrompt(
    process,
    'Do you want to change additional project settings?'
  );

  if (hasAdditionalProjectSettingsToChange) {
    process.stdin?.write('y\n');
  } else {
    process.stdin?.write('\n');
  }

  if (vercelAuth === 'none') {
    await waitForPrompt(
      process,
      'Want to use the default Deployment Protection settings?'
    );
    process.stdin?.write('n\n');

    await waitForPrompt(
      process,
      'What setting do you want to use for Vercel Authentication?'
    );
    // select "none"
    process.stdin?.write('\x1b[B'); // Down Arrow
    process.stdin?.write('\n');
  }

  await waitForPrompt(process, 'Linked to');
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

  // Make sure the token gets revoked unless it's passed in via environment
  if (!process.env.VERCEL_TOKEN) {
    await execCli(binaryPath, ['logout']);
  }

  const allTmpDirs = listTmpDirs();
  for (const tmpDir of allTmpDirs) {
    tmpDir.removeCallback();
  }
});

// https://linear.app/vercel/issue/ZERO-2555/fix-or-skip-assign-a-domain-to-a-project-test
// eslint-disable-next-line jest/no-disabled-tests
test.skip('assign a domain to a project', async () => {
  const team = await teamPromise;
  const domain = `project-domain.${team.slug}.vercel.app`;
  const directory = await setupE2EFixture('static-deployment');

  const deploymentOutput = await execCli(binaryPath, [
    directory,
    '--public',
    '--yes',
  ]);
  expect(deploymentOutput.exitCode, formatOutput(deploymentOutput)).toBe(0);

  const host = deploymentOutput.stdout?.trim().replace('https://', '');
  const deployment = (await apiFetch(
    `/v10/now/deployments/unknown?url=${host}`
  ).then(resp => resp.json())) as Record<string, any>;

  expect(typeof deployment.name).toBe('string');
  const project = deployment.name;

  const output = await execCli(binaryPath, [
    'domains',
    'add',
    domain,
    project,
    '--force',
  ]);
  expect(output.exitCode, formatOutput(output)).toBe(0);

  const removeResponse = await execCli(binaryPath, ['rm', project, '-y']);
  expect(removeResponse.exitCode, formatOutput(removeResponse)).toBe(0);
});

test('ensure `github` and `scope` are not sent to the API', async () => {
  const directory = await setupE2EFixture('github-and-scope-config');
  const output = await execCli(binaryPath, [directory, '--yes']);

  expect(output.exitCode, formatOutput(output)).toBe(0);
});

// TODO: fix: --public does not make deployments public
// eslint-disable-next-line jest/no-disabled-tests
test.skip('should show prompts to set up project during first deploy', async () => {
  const dir = await setupE2EFixture('project-link-deploy');
  const projectName = `project-link-deploy-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const now = execCli(binaryPath, [dir], {
    env: {
      FORCE_TTY: '1',
    },
  });

  await setupProject(
    now,
    projectName,
    {
      buildCommand: `mkdir -p o && echo '<h1>custom hello</h1>' > o/index.html`,
      outputDirectory: 'o',
    },
    {
      vercelAuth: 'none',
    }
  );

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

  const { href } = new URL(output.stdout);

  // Send a test request to the deployment
  const response = await fetch(href);
  const text = await response.text();
  expect(text).toContain('<h1>custom hello</h1>');

  // Ensure that `vc dev` also uses the configured build command
  // and output directory
  let stderr = '';
  const port = 58351;
  const dev = execCli(binaryPath, ['dev', '--listen', port.toString(), dir]);
  dev.stderr?.setEncoding('utf8');

  try {
    dev.stdin?.pipe(process.stdout);
    dev.stderr?.pipe(process.stderr);
    await new Promise<void>((resolve, reject) => {
      dev.once('close', (code, signal) => {
        reject(`"vc dev" failed with ${signal || code}`);
      });
      dev.stderr?.on('data', data => {
        stderr += data;
        if (stderr?.includes('Ready! Available at')) {
          resolve();
        }
      });
    });

    const res2 = await fetch(`http://localhost:${port}/`);
    const text2 = await res2.text();
    expect(text2).toContain('<h1>custom hello</h1>');
  } finally {
    process.kill(dev.pid!, 'SIGTERM');
  }
});

test('should prefill "project name" prompt with now.json `name`', async () => {
  const directory = await setupE2EFixture('static-deployment');
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

  const now = execCli(binaryPath, [directory], {
    env: {
      FORCE_TTY: '1',
    },
  });

  let isDeprecated = false;

  now.stderr?.on('data', data => {
    if (
      data
        .toString()
        .includes('The `name` property in vercel.json is deprecated')
    ) {
      isDeprecated = true;
    }
  });

  await waitForPrompt(now, /Set up and deploy[^?]+\?/);
  now.stdin?.write('yes\n');

  await waitForPrompt(now, 'Which scope should contain your project?');
  now.stdin?.write('\n');

  await waitForPrompt(now, 'Link to existing project?');
  now.stdin?.write('no\n');

  await waitForPrompt(now, `What’s your project’s name? (${projectName})`);
  now.stdin?.write(`\n`);

  await waitForPrompt(now, 'In which directory is your code located?');
  now.stdin?.write('\n');

  await waitForPrompt(now, 'Want to modify these settings?');
  now.stdin?.write('no\n');

  await waitForPrompt(
    now,
    'Do you want to change additional project settings?'
  );
  now.stdin?.write('\n');

  await waitForPrompt(now, /Linked to/);

  const output = await now;
  expect(output.exitCode, formatOutput(output)).toBe(0);

  expect(isDeprecated, 'isDeprecated').toBe(true);

  // clean up
  await remove(path.join(directory, 'vercel.json'));
});

test('deploy with unknown `VERCEL_PROJECT_ID` should fail', async () => {
  const directory = await setupE2EFixture('static-deployment');

  const output = await execCli(binaryPath, [directory], {
    env: {
      VERCEL_ORG_ID: process.env.VERCEL_TEAM_ID,
      VERCEL_PROJECT_ID: 'asdf',
    },
  });

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toContain('Project not found');
});

test('deploy with `VERCEL_ORG_ID` but without `VERCEL_PROJECT_ID` should fail', async () => {
  const directory = await setupE2EFixture('static-deployment');

  const output = await execCli(binaryPath, [directory], {
    env: { VERCEL_ORG_ID: process.env.VERCEL_TEAM_ID },
  });

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toContain(
    'You specified `VERCEL_ORG_ID` but you forgot to specify `VERCEL_PROJECT_ID`. You need to specify both to deploy to a custom project.'
  );
});

test('deploy with `VERCEL_PROJECT_ID` but without `VERCEL_ORG_ID` should fail', async () => {
  const directory = await setupE2EFixture('static-deployment');

  const output = await execCli(binaryPath, [directory], {
    env: { VERCEL_PROJECT_ID: 'asdf' },
  });

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toContain(
    'You specified `VERCEL_PROJECT_ID` but you forgot to specify `VERCEL_ORG_ID`. You need to specify both to deploy to a custom project.'
  );
});

test('deploy with `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`', async () => {
  const directory = await setupE2EFixture('static-deployment');

  // generate `.vercel`
  await execCli(binaryPath, [directory, '--yes']);

  const link = require(path.join(directory, '.vercel/project.json'));
  await remove(path.join(directory, '.vercel'));

  const output = await execCli(binaryPath, [directory], {
    env: {
      VERCEL_ORG_ID: link.orgId,
      VERCEL_PROJECT_ID: link.projectId,
    },
  });

  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stdout).not.toContain('Linked to');
});

test('deploy shows notice when project in `.vercel` does not exists', async () => {
  const team = await teamPromise;
  const directory = await setupE2EFixture('static-deployment');

  // overwrite .vercel with unexisting project
  await ensureDir(path.join(directory, '.vercel'));
  await writeFile(
    path.join(directory, '.vercel/project.json'),
    JSON.stringify({
      orgId: team.id,
      projectId: 'asdf',
    })
  );

  const now = execCli(binaryPath, [directory], {
    env: {
      FORCE_TTY: '1',
    },
  });

  let detectedNotice = false;

  // kill after first prompt
  await waitForPrompt(now, chunk => {
    detectedNotice =
      detectedNotice ||
      chunk.includes(
        'Your Project was either deleted, transferred to a new Team, or you don’t have access to it anymore'
      );

    return /Set up and deploy[^?]+\?/.test(chunk);
  });
  now.stdin?.write('no\n');

  expect(detectedNotice, 'detectedNotice').toBe(true);
});

test('use `rootDirectory` from project when deploying', async () => {
  const projectName = `project-root-directory-${
    Math.random().toString(36).split('.')[1]
  }`;

  const directory = await setupE2EFixture('project-root-directory');

  const firstDeploy = execCli(
    binaryPath,
    [directory, '--name', projectName, '--public'],
    {
      env: {
        FORCE_TTY: '1',
      },
    }
  );
  await setupProject(
    firstDeploy,
    projectName,
    {},
    {
      vercelAuth: 'none',
    }
  );
  const firstResult = await firstDeploy;
  expect(firstResult.exitCode, formatOutput(firstResult)).toBe(0);

  const projectResponse = await apiFetch(`/v2/projects/${projectName}`, {
    method: 'PATCH',
    body: JSON.stringify({
      rootDirectory: 'src',
    }),
  });

  expect(projectResponse.status, await projectResponse.text()).toBe(200);

  const secondResult = await execCli(binaryPath, [directory, '--public']);
  expect(secondResult.exitCode, formatOutput(secondResult)).toBe(0);

  const { href } = new URL(secondResult.stdout);

  const pageResponse1 = await fetch(href);
  expect(pageResponse1.status).toBe(200);
  expect(await pageResponse1.text()).toMatch(/I am a website/gm);

  // Ensures that the `now.json` file has been applied
  const pageResponse2 = await fetch(`${secondResult.stdout}/i-do-exist`);
  expect(pageResponse2.status).toBe(200);
  expect(await pageResponse2.text()).toMatch(/I am a website/gm);

  await apiFetch(`/v2/projects/${projectName}`, {
    method: 'DELETE',
  });
});

test('vercel deploy with unknown `VERCEL_ORG_ID` or `VERCEL_PROJECT_ID` should error', async () => {
  const team = await teamPromise;
  const output = await execCli(binaryPath, ['deploy'], {
    env: { VERCEL_ORG_ID: team.id, VERCEL_PROJECT_ID: 'asdf' },
  });

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toContain('Project not found');
});

test('vercel env with unknown `VERCEL_ORG_ID` or `VERCEL_PROJECT_ID` should error', async () => {
  const team = await teamPromise;
  const output = await execCli(binaryPath, ['env', 'ls'], {
    env: { VERCEL_ORG_ID: team.id, VERCEL_PROJECT_ID: 'asdf' },
  });

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toContain('Project not found');
});

test('add a sensitive env var', async () => {
  const dir = await setupE2EFixture('project-sensitive-env-vars');
  const projectName = `project-sensitive-env-vars-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const vc = execCli(binaryPath, ['link'], {
    cwd: dir,
    env: {
      FORCE_TTY: '1',
    },
  });

  await setupProject(vc, projectName, {
    buildCommand: `mkdir -p o && echo '<h1>custom hello</h1>' > o/index.html`,
    outputDirectory: 'o',
  });

  await vc;

  const link = require(path.join(dir, '.vercel/project.json'));

  const output = await execCli(
    binaryPath,
    ['env', 'add', 'envVarName', 'production', '--sensitive'],
    {
      env: {
        VERCEL_ORG_ID: link.orgId,
        VERCEL_PROJECT_ID: link.projectId,
      },
      input: 'test\n',
    }
  );

  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toContain(
    'Added Environment Variable envVarName to Project'
  );
});

test('override an existing env var', async () => {
  const dir = await setupE2EFixture('project-override-env-vars');
  const projectName = `project-override-env-vars-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const vc = execCli(binaryPath, ['link'], {
    cwd: dir,
    env: {
      FORCE_TTY: '1',
    },
  });

  await setupProject(vc, projectName, {
    buildCommand: `mkdir -p o && echo '<h1>custom hello</h1>' > o/index.html`,
    outputDirectory: 'o',
  });

  await vc;

  const link = require(path.join(dir, '.vercel/project.json'));
  const options = {
    env: {
      VERCEL_ORG_ID: link.orgId,
      VERCEL_PROJECT_ID: link.projectId,
    },
  };

  // 1. Initial add
  const output = await execCli(
    binaryPath,
    ['env', 'add', 'envVarName', 'production'],
    {
      ...options,
      input: 'test\n',
    }
  );

  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toContain(
    'Added Environment Variable envVarName to Project'
  );

  // 2. Override
  const outputOverride = await execCli(
    binaryPath,
    ['env', 'add', 'envVarName', 'production', '--force'],
    {
      ...options,
      input: 'test\n',
    }
  );

  expect(outputOverride.exitCode, formatOutput(outputOverride)).toBe(0);
  expect(outputOverride.stderr).toContain(
    'Overrode Environment Variable envVarName to Project'
  );
});

test('whoami with `VERCEL_ORG_ID` should favor `--scope` and should error', async () => {
  const output = await execCli(binaryPath, ['whoami', '--scope', 'asdf'], {
    env: { VERCEL_ORG_ID: process.env.VERCEL_TEAM_ID },
  });

  expect(output.exitCode, formatOutput(output)).toBe(1);
  expect(output.stderr).toContain('The specified scope does not exist');
});

test('whoami with local .vercel scope', async () => {
  const directory = await setupE2EFixture('static-deployment');

  // create local .vercel
  await ensureDir(path.join(directory, '.vercel'));
  await fs.writeFile(
    path.join(directory, '.vercel', 'project.json'),
    JSON.stringify({ orgId: process.env.VERCEL_TEAM_ID, projectId: 'xxx' })
  );

  const output = await execCli(binaryPath, ['whoami'], {
    cwd: directory,
  });

  expect(output.exitCode, formatOutput(output)).toBe(0);

  const user = await userPromise;
  expect(output.stdout).toContain(user.username);

  // clean up
  await remove(path.join(directory, '.vercel'));
});

describe('telemetry submits data', () => {
  const telemetryDisabledEnvVariable = process.env.VERCEL_TELEMETRY_DISABLED;
  beforeAll(() => {
    delete process.env.VERCEL_TELEMETRY_DISABLED;
  });
  afterAll(() => {
    process.env.VERCEL_TELEMETRY_DISABLED = telemetryDisabledEnvVariable;
  });
  const prepareBridge = async () => {
    const mockTelemetryBridgeApp = express();
    const mockTelemetryBridgeServer = createServer(mockTelemetryBridgeApp);
    await listen(mockTelemetryBridgeServer, 0);
    const address = mockTelemetryBridgeServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unexpected http server address');
    }
    process.env.VERCEL_TELEMETRY_BRIDGE_URL = `http://127.0.0.1:${address.port}`;

    const directory = await setupE2EFixture('static-deployment');
    // create local .vercel
    await ensureDir(path.join(directory, '.vercel'));
    await fs.writeFile(
      path.join(directory, '.vercel', 'project.json'),
      JSON.stringify({ orgId: process.env.VERCEL_TEAM_ID, projectId: 'xxx' })
    );
    const cleanup = async () => {
      await mockTelemetryBridgeServer.close();
      await remove(path.join(directory, '.vercel'));
      delete process.env.VERCEL_TELEMETRY_BRIDGE_URL;
    };
    return {
      mockTelemetryBridgeApp,
      directory,
      cleanup,
    };
  };
  describe('when --debug is not enabled', () => {
    test('does not wait for the send process before exiting', async () => {
      let resolveBridgeEvent: () => void;
      const bridgeEventPromise = new Promise<void>(resolve => {
        resolveBridgeEvent = resolve;
      });
      const { mockTelemetryBridgeApp, directory, cleanup } =
        await prepareBridge();

      let mockTelemetryBridgeWasCalled = false;
      mockTelemetryBridgeApp.use((_req, res) => {
        mockTelemetryBridgeWasCalled = true;
        res.header('x-vercel-cli-tracked', '1');
        res.status(204).send();
        resolveBridgeEvent();
      });
      const output = await execCli(binaryPath, ['help', 'deploy'], {
        cwd: directory,
      });
      expect(mockTelemetryBridgeWasCalled).toEqual(false);
      expect(output.exitCode, formatOutput(output)).toBe(2);

      await bridgeEventPromise;
      expect(mockTelemetryBridgeWasCalled).toEqual(true);

      await cleanup();
    });
    test('gracefully exits if the server does not respond', async () => {
      const { mockTelemetryBridgeApp, cleanup, directory } =
        await prepareBridge();

      let mockTelemetryBridgeWasCalled = false;
      mockTelemetryBridgeApp.use(() => {
        mockTelemetryBridgeWasCalled = true;
      });
      const output = await execCli(binaryPath, ['help', 'deploy'], {
        cwd: directory,
      });
      expect(output.exitCode, formatOutput(output)).toBe(2);
      expect(mockTelemetryBridgeWasCalled).toEqual(false);
      expect(output.exitCode, formatOutput(output)).toBe(2);

      await cleanup();
    });
  });
  describe('when --debug is enabled', () => {
    test('gracefully exits if the server does not respond', async () => {
      const { mockTelemetryBridgeApp, cleanup, directory } =
        await prepareBridge();

      let mockTelemetryBridgeWasCalled = false;
      mockTelemetryBridgeApp.use(() => {
        mockTelemetryBridgeWasCalled = true;
      });
      const output = await execCli(binaryPath, ['help', 'deploy', '-d'], {
        cwd: directory,
      });
      expect(output.stderr).toContain('Telemetry subprocess exited');
      expect(output.exitCode, formatOutput(output)).toBe(2);
      expect(mockTelemetryBridgeWasCalled).toEqual(true);

      await cleanup();
    });
    test('gracefully exits if the server responds with a non-204 error', async () => {
      const { mockTelemetryBridgeApp, cleanup, directory } =
        await prepareBridge();
      let mockTelemetryBridgeWasCalled = false;
      mockTelemetryBridgeApp.use((_req, res) => {
        mockTelemetryBridgeWasCalled = true;
        res.status(403).send();
      });
      const output = await execCli(binaryPath, ['help', 'deploy', '-d'], {
        cwd: directory,
      });
      expect(output.stderr).toContain('Failed to send telemetry events');
      expect(output.exitCode, formatOutput(output)).toBe(2);
      expect(mockTelemetryBridgeWasCalled).toEqual(true);

      await cleanup();
    });
    test('it waits for the response and logs it', async () => {
      const { mockTelemetryBridgeApp, cleanup, directory } =
        await prepareBridge();

      let mockTelemetryBridgeWasCalled = false;
      mockTelemetryBridgeApp.use((_req, res) => {
        mockTelemetryBridgeWasCalled = true;
        res.header('x-vercel-cli-tracked', '1');
        res.status(204).send();
      });
      const output = await execCli(binaryPath, ['help', 'deploy', '-d'], {
        cwd: directory,
      });
      expect(output.stderr).toContain('Telemetry event tracked');
      expect(output.exitCode, formatOutput(output)).toBe(2);
      expect(mockTelemetryBridgeWasCalled).toEqual(true);

      await cleanup();
    });
  });
});

test('deploys with only now.json and README.md', async () => {
  const directory = await setupE2EFixture('deploy-with-only-readme-now-json');

  const { exitCode, stdout, stderr } = await execCli(binaryPath, ['--yes'], {
    cwd: directory,
  });

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  const { host } = new URL(stdout);
  const res = await fetch(`https://${host}/README.md`);
  const text = await res.text();
  expect(text).toMatch(/readme contents/);
});

test('deploys with only vercel.json and README.md', async () => {
  const directory = await setupE2EFixture(
    'deploy-with-only-readme-vercel-json'
  );

  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    ['--yes', '--no-logs'],
    {
      cwd: directory,
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  // assert timing order of showing URLs vs status updates
  // Preview URL appears twice: once with loading emoji, then again with success emoji
  expect(stripAnsi(stderr)).toMatch(
    /Inspect.*\nPreview.*\n(Queued|Building).*[\s\S]*Completing/
  );

  const { host } = new URL(stdout);
  const res = await fetch(`https://${host}/README.md`);
  const text = await res.text();
  expect(text).toMatch(/readme contents/);
});

test('reject conflicting `vercel.json` and `now.json` files', async () => {
  const directory = await setupE2EFixture('conflicting-now-json-vercel-json');

  const { exitCode, stdout, stderr } = await execCli(binaryPath, ['--yes'], {
    cwd: directory,
  });

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(stderr).toContain(
    'Cannot use both a `vercel.json` and `now.json` file. Please delete the `now.json` file.'
  );
});

test('`vc --debug project ls` should output the projects listing', async () => {
  const { exitCode, stdout, stderr } = await execCli(binaryPath, [
    '--debug',
    'project',
    'ls',
  ]);

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);
  expect(stderr).toContain('> Projects found under');
});

// eslint-disable-next-line jest/no-disabled-tests
test.skip(
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
      const { exitCode, stdout, stderr } = await execCli(
        binaryPath,
        ['--public', '--yes'],
        {
          cwd,
          stdio: 'inherit',
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

// TODO: fix: --public does not make deployments public
// eslint-disable-next-line jest/no-disabled-tests
test.skip('deploy pnpm twice using pnp and symlink=false', async () => {
  const directory = path.join(__dirname, 'fixtures/unit/pnpm-pnp-symlink');

  await remove(path.join(directory, '.vercel'));

  function deploy() {
    return execCli(binaryPath, [directory, '--name', session, '--public'], {
      env: {
        FORCE_TTY: '1',
      },
    });
  }

  const firstDeploy = deploy();
  await setupProject(
    firstDeploy,
    session,
    {},
    {
      vercelAuth: 'none',
    }
  );
  let { exitCode, stdout, stderr } = await firstDeploy;
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  let page = await fetch(stdout);
  let text = await page.text();
  expect(text).toBe('no cache\n');

  ({ exitCode, stdout, stderr } = await deploy());
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  page = await fetch(stdout);
  text = await page.text();

  expect(text).toContain('cache exists\n');

  // Since this test asserts that we can create a new project based on the folder name, delete it after the test
  // to avoid polluting the project list.
  await apiFetch(`/projects/${session}`, {
    method: 'DELETE',
  });
});

test('reject deploying with wrong team .vercel config', async () => {
  const directory = await setupE2EFixture('unauthorized-vercel-config');

  const { exitCode, stdout, stderr } = await execCli(binaryPath, ['--yes'], {
    cwd: directory,
  });

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(stderr).toContain(
    'Could not retrieve Project Settings. To link your Project, remove the `.vercel` directory and deploy again.'
  );
});

test('reject deploying with invalid token', async () => {
  const directory = await setupE2EFixture('unauthorized-vercel-config');
  const { exitCode, stdout, stderr } = await execCli(binaryPath, ['--yes'], {
    cwd: directory,
  });

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(1);
  expect(stderr).toMatch(
    /Error: Could not retrieve Project Settings\. To link your Project, remove the `\.vercel` directory and deploy again\./g
  );
});

test('[vc link] should detect frameworks in project rootDirectory', async () => {
  const dir = await setupE2EFixture('zero-config-next-js-nested');
  const projectRootDir = 'app';

  const projectName = `project-link-dev-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const vc = execCli(binaryPath, ['link', `--project=${projectName}`], {
    cwd: dir,
    env: {
      FORCE_TTY: '1',
    },
  });

  await waitForPrompt(vc, /Set up[^?]+\?/);
  vc.stdin?.write('yes\n');

  await waitForPrompt(vc, 'Which scope should contain your project?');
  vc.stdin?.write('\n');

  await waitForPrompt(vc, 'Link to existing project?');
  vc.stdin?.write('no\n');

  await waitForPrompt(vc, 'What’s your project’s name?');
  vc.stdin?.write(`${projectName}\n`);

  await waitForPrompt(vc, 'In which directory is your code located?');
  vc.stdin?.write(`${projectRootDir}\n`);

  // This means the framework detection worked!
  await waitForPrompt(vc, 'Auto-detected Project Settings for Next.js');

  vc.kill();
});

test('[vc link] should not duplicate paths in .gitignore', async () => {
  const dir = await setupE2EFixture('project-link-gitignore');

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    ['link', '--yes'],
    {
      cwd: dir,
      env: {
        FORCE_TTY: '1',
      },
    }
  );

  // Ensure the exit code is right
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  // Ensure the message is correct pattern
  expect(stderr).toMatch(/Linked to /m);

  // Ensure .gitignore contains .vercel and .env*.local (from env pull)
  const gitignore = await readFile(path.join(dir, '.gitignore'), 'utf8');
  expect(gitignore).toBe('.vercel\n.env*.local\n');
});

test('[vc dev] should show prompts to set up project', async () => {
  const dir = await setupE2EFixture('project-link-dev');
  const port = 58352;
  const projectName = `project-link-dev-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const dev = execCli(binaryPath, ['dev', '--listen', port.toString()], {
    cwd: dir,
    env: {
      FORCE_TTY: '1',
    },
  });

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

  await waitForPrompt(dev, 'Ready! Available at');

  // Ensure that `vc dev` also works
  try {
    const response = await fetch(`http://localhost:${port}/`);
    const text = await response.text();
    expect(text).toContain('<h1>custom hello</h1>');
  } finally {
    process.kill(dev.pid!, 'SIGTERM');
  }
});

test('[vc link] should show project prompts but not framework when `builds` defined', async () => {
  const dir = await setupE2EFixture('project-link-legacy');
  const projectName = `project-link-legacy-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const vc = execCli(binaryPath, ['link'], {
    cwd: dir,
    env: {
      FORCE_TTY: '1',
    },
  });

  await waitForPrompt(vc, /Set up[^?]+\?/);
  vc.stdin?.write('yes\n');

  await waitForPrompt(vc, 'Which scope should contain your project?');
  vc.stdin?.write('\n');

  await waitForPrompt(vc, 'Link to existing project?');
  vc.stdin?.write('no\n');

  await waitForPrompt(vc, 'What’s your project’s name?');
  vc.stdin?.write(`${projectName}\n`);

  await waitForPrompt(vc, 'In which directory is your code located?');
  vc.stdin?.write('\n');

  await waitForPrompt(vc, 'Do you want to change additional project settings?');
  vc.stdin?.write('\n');

  await waitForPrompt(vc, 'Linked to');

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
  const dir = await setupE2EFixture('dev-proxy-headers-and-env');
  const port = 58353;
  const projectName = `dev-proxy-headers-and-env-${
    Math.random().toString(36).split('.')[1]
  }`;

  // remove previously linked project if it exists
  await remove(path.join(dir, '.vercel'));

  const dev = execCli(binaryPath, ['dev', '--listen', port.toString()], {
    cwd: dir,
    env: {
      FORCE_TTY: '1',
    },
  });

  await setupProject(dev, projectName, {
    buildCommand: `mkdir -p o && echo '<h1>custom hello</h1>' > o/index.html`,
    outputDirectory: 'o',
    devCommand: 'node server.js',
  });

  await waitForPrompt(dev, 'Ready! Available at');

  // Ensure that `vc dev` also works
  try {
    const response = await fetch(`http://localhost:${port}/`);
    const body = (await response.json()) as Record<string, any>;
    expect(body.headers['x-vercel-deployment-url']).toBe(`localhost:${port}`);
    expect(body.env.NOW_REGION).toBe('dev1');
  } finally {
    process.kill(dev.pid!, 'SIGTERM');
  }
});

test('[vc build] should build project with `@vercel/static-build`', async () => {
  const directory = await setupE2EFixture('vc-build-static-build');
  const output = await execCli(binaryPath, ['build'], { cwd: directory });
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

test('[vc build] should build project with `@vercel/speed-insights`', async () => {
  const directory = await setupE2EFixture('vc-build-speed-insights');
  const output = await execCli(binaryPath, ['build'], { cwd: directory });
  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toContain('Build Completed in .vercel/output');
  const builds = await fs.readJSON(
    path.join(directory, '.vercel/output/builds.json')
  );
  expect(builds?.features?.speedInsightsVersion).toEqual('0.0.4');
});

test('[vc build] should build project with an indirect dependency to `@vercel/analytics`', async () => {
  const directory = await setupE2EFixture('vc-build-indirect-web-analytics');
  const output = await execCli(binaryPath, ['build'], { cwd: directory });
  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toContain('Build Completed in .vercel/output');
  const builds = await fs.readJSON(
    path.join(directory, '.vercel/output/builds.json')
  );
  expect(builds?.features?.webAnalyticsVersion).toEqual('1.1.1');
});

test('[vc build] should build project with `@vercel/analytics`', async () => {
  const directory = await setupE2EFixture('vc-build-web-analytics');
  const output = await execCli(binaryPath, ['build'], { cwd: directory });
  expect(output.exitCode, formatOutput(output)).toBe(0);
  const builds = await fs.readJSON(
    path.join(directory, '.vercel/output/builds.json')
  );
  expect(builds?.features?.webAnalyticsVersion).toEqual('1.0.0');
});

test('[vc build] should not include .vercel when distDir is "."', async () => {
  const directory = await setupE2EFixture('static-build-dist-dir');
  const output = await execCli(binaryPath, ['build'], { cwd: directory });
  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toContain('Build Completed in .vercel/output');
  const dir = await fs.readdir(path.join(directory, '.vercel/output/static'));
  expect(dir).not.toContain('.vercel');
  expect(dir).toContain('index.txt');
});

test('[vc build] should not include .vercel when zeroConfig is true and outputDirectory is "."', async () => {
  const directory = await setupE2EFixture(
    'static-build-zero-config-output-directory'
  );
  const output = await execCli(binaryPath, ['build'], { cwd: directory });
  expect(output.exitCode, formatOutput(output)).toBe(0);
  expect(output.stderr).toContain('Build Completed in .vercel/output');
  const dir = await fs.readdir(path.join(directory, '.vercel/output/static'));
  expect(dir).not.toContain('.vercel');
  expect(dir).toContain('index.txt');
});

// TODO: fix: --public does not make deployments public
// eslint-disable-next-line jest/no-disabled-tests
test.skip('vercel.json configuration overrides in a new project prompt user and merges settings correctly', async () => {
  let directory = await setupE2EFixture(
    'vercel-json-configuration-overrides-merging-prompts'
  );

  const randomDirectoryName = `temp-${
    Math.random().toString(36).split('.')[1]
  }`;
  const parent = path.join(directory, '..');
  const newDirectory = path.join(parent, randomDirectoryName);
  fs.renameSync(directory, newDirectory);
  directory = newDirectory;

  // remove previously linked project if it exists
  await remove(path.join(directory, '.vercel'));

  const vc = execCli(binaryPath, [directory], {
    env: {
      FORCE_TTY: '1',
    },
  });

  await waitForPrompt(vc, 'Set up and deploy');
  vc.stdin?.write('y\n');
  await waitForPrompt(vc, /Which scope [^?]+\?/);
  vc.stdin?.write('\n');
  await waitForPrompt(vc, 'Link to existing project?');
  vc.stdin?.write('n\n');
  await waitForPrompt(vc, 'What’s your project’s name?');
  vc.stdin?.write('\n');
  await waitForPrompt(vc, 'In which directory is your code located?');
  vc.stdin?.write('\n');
  await waitForPrompt(vc, 'Want to modify these settings?');
  vc.stdin?.write('y\n');
  await waitForPrompt(
    vc,
    'Which settings would you like to overwrite (select multiple)?'
  );
  vc.stdin?.write('a\n');
  await waitForPrompt(vc, "What's your Development Command?");
  vc.stdin?.write('echo "DEV COMMAND"\n');
  // the crux of this test is to make sure that the outputDirectory is properly set by the prompts.
  // otherwise the output from the build command will not be the index route and the page text assertion below will fail.
  await waitForPrompt(vc, "What's your Output Directory?");
  vc.stdin?.write('output\n');
  await waitForPrompt(vc, 'Do you want to change additional project settings?');
  vc.stdin?.write('n\n');
  await waitForPrompt(
    vc,
    'What setting do you want to use for Vercel Authentication?'
  );
  vc.stdin?.write('\x1b[B'); // Down Arrow
  vc.stdin?.write('\n');
  await waitForPrompt(vc, 'Linked to');
  const deployment = await vc;
  expect(deployment.exitCode, formatOutput(deployment)).toBe(0);
  // assert the command were executed
  const page = await fetch(deployment.stdout);
  const text = await page.text();
  expect(text).toBe('1\n');
  // Since this test asserts that we can create a new project based on the folder name, delete it after the test
  // to avoid polluting the project list.
  await apiFetch(`/projects/${randomDirectoryName}`, {
    method: 'DELETE',
  });
});

test('vercel.json configuration overrides in an existing project do not prompt user and correctly apply overrides', async () => {
  // create project directory and get path to vercel.json
  const directory = await setupE2EFixture(
    'vercel-json-configuration-overrides'
  );
  const vercelJsonPath = path.join(directory, 'vercel.json');

  async function deploy(autoConfirm = false) {
    const deployment = await execCli(
      binaryPath,
      [directory, '--public'].concat(autoConfirm ? ['--yes'] : [])
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

  const { href } = new URL(deployment.stdout);
  let page = await fetch(href);
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

test.each([
  {
    vercelAuth: 'none',
    expectedStatus: 200,
  },
  {
    vercelAuth: 'standard',
    expectedStatus: 401,
  },
] as const)(
  '[vc deploy] should allow a project to be created with Vercel Auth disabled or enabled with prompts - vercelAuth: %s',
  async ({ vercelAuth, expectedStatus }) => {
    const dir = await setupE2EFixture('project-vercel-auth');
    const projectName = `project-vercel-auth-${
      Math.random().toString(36).split('.')[1]
    }`;

    // remove previously linked project if it exists
    await remove(path.join(dir, '.vercel'));

    const now = execCli(binaryPath, [dir], {
      env: {
        FORCE_TTY: '1',
      },
    });

    await setupProject(
      now,
      projectName,
      {
        buildCommand: `mkdir -p o && echo '<h1>custom hello</h1>' > o/index.html`,
        outputDirectory: 'o',
      },
      {
        vercelAuth,
      }
    );

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

    const { href } = new URL(output.stdout);

    // Send a test request to the deployment
    const response = await fetch(href);
    expect(response.status).toBe(expectedStatus);

    const projectResponse = await apiFetch(`/projects/${projectName}`, {
      method: 'DELETE',
    });
    expect(projectResponse.status).toBe(204);
  }
);
