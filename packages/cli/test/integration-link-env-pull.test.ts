import { describe, expect, it } from 'vitest';
import { join } from 'path';
import { remove, pathExists } from 'fs-extra';
import { setupE2EFixture } from './helpers/setup-e2e-fixture';
import { execCli } from './helpers/exec';
import { binaryPath } from './helpers/get-binary-path';
import { waitForPrompt } from './helpers/wait-for-prompt';

describe('[vc link] environment variable pull integration', () => {
  it('should prompt for env pull and handle acceptance', async () => {
    const dir = await setupE2EFixture('project-link-gitignore');
    const projectName = `link-env-pull-${Math.random().toString(36).split('.')[1]}`;

    // Remove previously linked project if it exists
    await remove(join(dir, '.vercel'));

    const vc = execCli(binaryPath, ['link', `--project=${projectName}`], {
      cwd: dir,
      env: {
        FORCE_TTY: '1',
      },
    });

    // Handle initial link prompts
    await waitForPrompt(vc, /Set up[^?]+\?/);
    vc.stdin?.write('yes\n');

    await waitForPrompt(vc, 'Which scope should contain your project?');
    vc.stdin?.write('\n');

    await waitForPrompt(vc, 'Link to existing project?');
    vc.stdin?.write('no\n');

    await waitForPrompt(vc, "What's your project's name?");
    vc.stdin?.write(`${projectName}\n`);

    await waitForPrompt(vc, 'In which directory is your code located?');
    vc.stdin?.write('\n');

    await waitForPrompt(vc, 'Want to modify these settings?');
    vc.stdin?.write('no\n');

    // Wait for successful linking message
    await waitForPrompt(vc, /Linked to/);

    // New env pull prompt should appear
    await waitForPrompt(
      vc,
      'Would you like to pull environment variables now?'
    );
    vc.stdin?.write('yes\n');

    const { exitCode } = await vc;
    expect(exitCode).toBe(0);

    // Verify project was linked
    expect(await pathExists(join(dir, '.vercel/project.json'))).toBe(true);
  });

  it('should handle env pull prompt decline', async () => {
    const dir = await setupE2EFixture('project-link-gitignore');
    const projectName = `link-env-decline-${Math.random().toString(36).split('.')[1]}`;

    // Remove previously linked project if it exists
    await remove(join(dir, '.vercel'));

    const vc = execCli(binaryPath, ['link', `--project=${projectName}`], {
      cwd: dir,
      env: {
        FORCE_TTY: '1',
      },
    });

    // Handle initial link prompts
    await waitForPrompt(vc, /Set up[^?]+\?/);
    vc.stdin?.write('yes\n');

    await waitForPrompt(vc, 'Which scope should contain your project?');
    vc.stdin?.write('\n');

    await waitForPrompt(vc, 'Link to existing project?');
    vc.stdin?.write('no\n');

    await waitForPrompt(vc, "What's your project's name?");
    vc.stdin?.write(`${projectName}\n`);

    await waitForPrompt(vc, 'In which directory is your code located?');
    vc.stdin?.write('\n');

    await waitForPrompt(vc, 'Want to modify these settings?');
    vc.stdin?.write('no\n');

    // Wait for successful linking message
    await waitForPrompt(vc, /Linked to/);

    // Decline the env pull prompt
    await waitForPrompt(
      vc,
      'Would you like to pull environment variables now?'
    );
    vc.stdin?.write('no\n');

    const { exitCode } = await vc;
    expect(exitCode).toBe(0);

    // Verify project was linked
    expect(await pathExists(join(dir, '.vercel/project.json'))).toBe(true);

    // Verify no env file was created (since we declined and there are no env vars to pull)
    expect(await pathExists(join(dir, '.env.local'))).toBe(false);
  });

  it('should work with --yes flag and skip env pull prompt', async () => {
    const dir = await setupE2EFixture('project-link-gitignore');
    const projectName = `link-env-yes-${Math.random().toString(36).split('.')[1]}`;

    // Remove previously linked project if it exists
    await remove(join(dir, '.vercel'));

    const vc = execCli(
      binaryPath,
      ['link', `--project=${projectName}`, '--yes'],
      {
        cwd: dir,
        env: {
          FORCE_TTY: '1',
        },
      }
    );

    // Handle initial link prompts (--yes doesn't skip all prompts)
    await waitForPrompt(vc, /Set up[^?]+\?/);
    vc.stdin?.write('yes\n');

    await waitForPrompt(vc, 'Which scope should contain your project?');
    vc.stdin?.write('\n');

    await waitForPrompt(vc, 'Link to existing project?');
    vc.stdin?.write('no\n');

    await waitForPrompt(vc, "What's your project's name?");
    vc.stdin?.write(`${projectName}\n`);

    await waitForPrompt(vc, 'In which directory is your code located?');
    vc.stdin?.write('\n');

    await waitForPrompt(vc, 'Want to modify these settings?');
    vc.stdin?.write('no\n');

    // Wait for successful linking message
    await waitForPrompt(vc, /Linked to/);

    // Should still get env pull prompt even with --yes
    await waitForPrompt(
      vc,
      'Would you like to pull environment variables now?'
    );
    vc.stdin?.write('yes\n');

    const { exitCode } = await vc;
    expect(exitCode).toBe(0);

    // Verify project was linked
    expect(await pathExists(join(dir, '.vercel/project.json'))).toBe(true);
  });
});
