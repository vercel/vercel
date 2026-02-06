import fs from 'fs-extra';
import path from 'path';
import { execCli } from './helpers/exec';
import formatOutput from './helpers/format-output';
import { teamPromise } from './helpers/get-account';
import { listTmpDirs } from './helpers/get-tmp-dir';
import {
  prepareE2EFixtures,
  setupE2EFixture,
} from './helpers/setup-e2e-fixture';
import waitForPrompt from './helpers/wait-for-prompt';

const TEST_TIMEOUT = 3 * 60 * 1000;
jest.setTimeout(TEST_TIMEOUT);

const binaryPath = path.resolve(__dirname, '../scripts/start.js');

beforeAll(async () => {
  try {
    const team = await teamPromise;
    await prepareE2EFixtures(team.slug, binaryPath);
  } catch (_err) {
    process.exit(1);
  }
});

afterAll(async () => {
  const allTmpDirs = listTmpDirs();
  for (const tmpDir of allTmpDirs) {
    tmpDir.removeCallback();
  }
});

test('[vc link] should skip env pull prompt when creating new project', async () => {
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

  await waitForPrompt(vc, /Set up[^?]+\?/);
  vc.stdin?.write('yes\n');

  await waitForPrompt(vc, 'Which scope should contain your project?');
  vc.stdin?.write('\n');

  await waitForPrompt(vc, 'Link to existing project?');
  vc.stdin?.write('no\n');

  await waitForPrompt(vc, `What’s your project’s name? (${projectName})`);
  vc.stdin?.write('\n');

  await waitForPrompt(vc, 'In which directory is your code located?');
  vc.stdin?.write('\n');

  await waitForPrompt(vc, 'Want to modify these settings?');
  vc.stdin?.write('no\n');

  await waitForPrompt(vc, 'Do you want to change additional project settings?');
  vc.stdin?.write('\n');

  await waitForPrompt(vc, /Linked to/);

  const { exitCode, stdout, stderr } = await vc;
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  expect(await fs.pathExists(path.join(dir, '.vercel/project.json'))).toBe(
    true
  );
});

test('[vc link] should not create .env.local when linking new project', async () => {
  const dir = await setupE2EFixture('project-link-gitignore');
  const projectName = `link-env-decline-${Math.random().toString(36).split('.')[1]}`;

  await fs.remove(path.join(dir, '.vercel'));
  await fs.remove(path.join(dir, '.env.local'));

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

  await waitForPrompt(vc, `What’s your project’s name? (${projectName})`);
  vc.stdin?.write('\n');

  await waitForPrompt(vc, 'In which directory is your code located?');
  vc.stdin?.write('\n');

  await waitForPrompt(vc, 'Want to modify these settings?');
  vc.stdin?.write('no\n');

  await waitForPrompt(vc, 'Do you want to change additional project settings?');
  vc.stdin?.write('\n');

  await waitForPrompt(vc, /Linked to/);

  const { exitCode, stdout, stderr } = await vc;
  expect(exitCode, formatOutput({ stdout, stderr })).toBe(0);

  expect(await fs.pathExists(path.join(dir, '.vercel/project.json'))).toBe(
    true
  );

  expect(await fs.pathExists(path.join(dir, '.env.local'))).toBe(false);
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
});
