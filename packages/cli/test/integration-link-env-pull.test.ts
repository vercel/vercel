import path from 'path';
import { execCli } from './helpers/exec';
import fs from 'fs-extra';
import waitForPrompt from './helpers/wait-for-prompt';
import { listTmpDirs } from './helpers/get-tmp-dir';
import { teamPromise } from './helpers/get-account';
import {
  setupE2EFixture,
  prepareE2EFixtures,
} from './helpers/setup-e2e-fixture';
import formatOutput from './helpers/format-output';

const TEST_TIMEOUT = 3 * 60 * 1000;
vi.setConfig({ testTimeout: TEST_TIMEOUT, hookTimeout: TEST_TIMEOUT });

const binaryPath = path.resolve(__dirname, '../scripts/start.js');

beforeAll(async () => {
  try {
    const team = await teamPromise;
    await prepareE2EFixtures(team.slug, binaryPath);
  } catch (err) {
    console.log('Failed test suite `beforeAll`');
    console.log(err);

    process.exit(1);
  }
});

afterAll(async () => {
  const allTmpDirs = listTmpDirs();
  for (const tmpDir of allTmpDirs) {
    console.log('Removing temp dir: ', tmpDir.name);
    tmpDir.removeCallback();
  }
});

test('[vc link] should refresh OIDC when creating a new project', async () => {
  const dir = await setupE2EFixture('project-link-gitignore');
  const projectName = `link-env-pull-${Math.random().toString(36).split('.')[1]}`;

  await fs.remove(path.join(dir, '.vercel'));
  await fs.remove(path.join(dir, '.env.local'));

  const vc = execCli(binaryPath, ['link', `--project=${projectName}`], {
    cwd: dir,
    env: {
      FORCE_TTY: '1',
    },
  });

  await waitForPrompt(vc, 'Directory');
  await waitForPrompt(vc, 'Which team?');
  vc.stdin?.write('\n');

  await waitForPrompt(vc, 'Project?');
  vc.stdin?.write('\n');

  await waitForPrompt(vc, `Name? (${projectName})`);
  vc.stdin?.write('\n');

  await waitForPrompt(vc, 'Code directory?');
  vc.stdin?.write('\n');

  await waitForPrompt(vc, 'Customize settings?');
  vc.stdin?.write('no\n');

  await waitForPrompt(vc, 'Customize advanced settings?');
  vc.stdin?.write('\n');

  await waitForPrompt(vc, /Created\s+/);

  const { exitCode, stdout, stderr } = await vc;
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  expect(await fs.pathExists(path.join(dir, '.vercel/project.json'))).toBe(
    true
  );
  expect(await fs.readFile(path.join(dir, '.env.local'), 'utf8')).toMatch(
    /^# Created by Vercel CLI\nVERCEL_OIDC_TOKEN="[^"\n]+"\n$/
  );
});

test('[vc link] should preserve existing .env.local when refreshing OIDC', async () => {
  const dir = await setupE2EFixture('project-link-gitignore');
  const projectName = `link-env-decline-${Math.random().toString(36).split('.')[1]}`;

  await fs.remove(path.join(dir, '.vercel'));
  await fs.writeFile(
    path.join(dir, '.env.local'),
    'LOCAL_ONLY=keep\nVERCEL_OIDC_TOKEN=stale-token\nTAIL=keep\n',
    'utf8'
  );

  const vc = execCli(binaryPath, ['link', `--project=${projectName}`], {
    cwd: dir,
    env: {
      FORCE_TTY: '1',
    },
  });

  await waitForPrompt(vc, 'Directory');
  await waitForPrompt(vc, 'Which team?');
  vc.stdin?.write('\n');

  await waitForPrompt(vc, 'Project?');
  vc.stdin?.write('\n');

  await waitForPrompt(vc, `Name? (${projectName})`);
  vc.stdin?.write('\n');

  await waitForPrompt(vc, 'Code directory?');
  vc.stdin?.write('\n');

  await waitForPrompt(vc, 'Customize settings?');
  vc.stdin?.write('no\n');

  await waitForPrompt(vc, 'Customize advanced settings?');
  vc.stdin?.write('\n');

  await waitForPrompt(vc, /Created\s+/);

  const { exitCode, stdout, stderr } = await vc;
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  expect(await fs.pathExists(path.join(dir, '.vercel/project.json'))).toBe(
    true
  );

  const envContents = await fs.readFile(path.join(dir, '.env.local'), 'utf8');
  expect(envContents).toMatch(
    /^LOCAL_ONLY=keep\nVERCEL_OIDC_TOKEN="[^"\n]+"\nTAIL=keep\n$/
  );
  expect(envContents).not.toContain('stale-token');
});

test('[vc link] should work with --yes flag and auto-confirm all prompts', async () => {
  const dir = await setupE2EFixture('project-link-gitignore');
  const projectName = `link-env-yes-${Math.random().toString(36).split('.')[1]}`;

  await fs.remove(path.join(dir, '.vercel'));
  await fs.remove(path.join(dir, '.env.local'));

  const { exitCode, stdout, stderr } = await execCli(
    binaryPath,
    ['link', `--project=${projectName}`, '--yes'],
    {
      cwd: dir,
      env: {
        FORCE_TTY: '1',
      },
    }
  );

  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  expect(await fs.pathExists(path.join(dir, '.vercel/project.json'))).toBe(
    true
  );
  expect(await fs.readFile(path.join(dir, '.env.local'), 'utf8')).toMatch(
    /^# Created by Vercel CLI\nVERCEL_OIDC_TOKEN="[^"\n]+"\n$/
  );
});
