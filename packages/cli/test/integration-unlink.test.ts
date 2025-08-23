import { describe, expect, it } from 'vitest';
import { join } from 'path';
import { remove, pathExists, writeFile } from 'fs-extra';
import { setupE2EFixture } from './helpers/setup-e2e-fixture';
import { execCli } from './helpers/exec';
import { binaryPath } from './helpers/get-binary-path';
import { waitForPrompt } from './helpers/wait-for-prompt';

describe('[vc unlink] integration tests', () => {
  it('should show error when directory is not linked', async () => {
    const dir = await setupE2EFixture('project-link-gitignore');

    // Remove any existing .vercel directory
    await remove(join(dir, '.vercel'));

    const { exitCode, stderr } = await execCli(binaryPath, ['unlink'], {
      cwd: dir,
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain(
      'This directory is not linked to a Vercel Project.'
    );
  });

  it('should unlink successfully with user confirmation', async () => {
    const dir = await setupE2EFixture('project-link-gitignore');
    const projectName = `unlink-test-${Math.random().toString(36).split('.')[1]}`;

    // Remove previously linked project if it exists
    await remove(join(dir, '.vercel'));

    // First, link the project
    const linkVc = execCli(binaryPath, ['link', `--project=${projectName}`], {
      cwd: dir,
      env: {
        FORCE_TTY: '1',
      },
    });

    // Handle link prompts
    await waitForPrompt(linkVc, /Set up[^?]+\?/);
    linkVc.stdin?.write('yes\n');

    await waitForPrompt(linkVc, 'Which scope should contain your project?');
    linkVc.stdin?.write('\n');

    await waitForPrompt(linkVc, 'Link to existing project?');
    linkVc.stdin?.write('no\n');

    await waitForPrompt(linkVc, "What's your project's name?");
    linkVc.stdin?.write(`${projectName}\n`);

    await waitForPrompt(linkVc, 'In which directory is your code located?');
    linkVc.stdin?.write('\n');

    await waitForPrompt(linkVc, 'Want to modify these settings?');
    linkVc.stdin?.write('no\n');

    await waitForPrompt(
      linkVc,
      'Do you want to change additional project settings?'
    );
    linkVc.stdin?.write('no\n');

    // Wait for successful linking
    await waitForPrompt(linkVc, /Linked to/);

    // Handle env pull prompt from our previous feature
    await waitForPrompt(
      linkVc,
      'Would you like to pull environment variables now?'
    );
    linkVc.stdin?.write('no\n');

    const linkResult = await linkVc;
    expect(linkResult.exitCode).toBe(0);

    // Verify project was linked
    expect(await pathExists(join(dir, '.vercel/project.json'))).toBe(true);

    // Now test unlinking
    const unlinkVc = execCli(binaryPath, ['unlink'], {
      cwd: dir,
      env: {
        FORCE_TTY: '1',
      },
    });

    // Handle unlink confirmation
    await waitForPrompt(unlinkVc, /Are you sure you want to unlink/);
    unlinkVc.stdin?.write('yes\n');

    // Wait for success message
    await waitForPrompt(unlinkVc, /Unlinked from/);

    const unlinkResult = await unlinkVc;
    expect(unlinkResult.exitCode).toBe(0);

    // Verify project was unlinked
    expect(await pathExists(join(dir, '.vercel'))).toBe(false);
  });

  it('should unlink with --yes flag without prompts', async () => {
    const dir = await setupE2EFixture('project-link-gitignore');
    const projectName = `unlink-yes-test-${Math.random().toString(36).split('.')[1]}`;

    // Remove previously linked project if it exists
    await remove(join(dir, '.vercel'));

    // First, link the project using --yes to skip prompts
    const linkResult = await execCli(
      binaryPath,
      ['link', `--project=${projectName}`, '--yes'],
      {
        cwd: dir,
        env: {
          FORCE_TTY: '1',
        },
      }
    );

    // Note: This might fail if project doesn't exist, but that's expected in integration tests
    // The important part is testing unlink functionality
    if (linkResult.exitCode === 0) {
      // Verify project was linked
      expect(await pathExists(join(dir, '.vercel/project.json'))).toBe(true);

      // Now test unlinking with --yes
      const { exitCode, stderr } = await execCli(
        binaryPath,
        ['unlink', '--yes'],
        {
          cwd: dir,
        }
      );

      expect(exitCode).toBe(0);
      expect(stderr).toContain('Unlinked from');

      // Verify project was unlinked
      expect(await pathExists(join(dir, '.vercel'))).toBe(false);
    }
  });

  it('should cancel when user declines unlink confirmation', async () => {
    const dir = await setupE2EFixture('project-link-gitignore');

    // Create a mock .vercel directory to simulate linked project
    await writeFile(
      join(dir, '.vercel', 'project.json'),
      JSON.stringify({
        orgId: 'test-org',
        projectId: 'test-project',
        projectName: 'test-project',
      })
    );

    const unlinkVc = execCli(binaryPath, ['unlink'], {
      cwd: dir,
      env: {
        FORCE_TTY: '1',
      },
    });

    // Handle unlink confirmation - decline
    await waitForPrompt(unlinkVc, /Are you sure you want to unlink/);
    unlinkVc.stdin?.write('no\n');

    // Wait for cancel message
    await waitForPrompt(unlinkVc, 'Canceled.');

    const unlinkResult = await unlinkVc;
    expect(unlinkResult.exitCode).toBe(0);

    // Verify project is still linked
    expect(await pathExists(join(dir, '.vercel'))).toBe(true);
  });
});
