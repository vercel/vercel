import { describe, it, expect, vi, beforeEach } from 'vitest';
import { basename, join } from 'path';
import { writeJSON, mkdirp, writeFile, pathExists } from 'fs-extra';
import unlink from '../../../../src/commands/unlink';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';

describe('unlink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock client.input.confirm for prompts
    client.input.confirm = vi.fn().mockResolvedValue(true);
  });

  describe('--help', () => {
    it('should show help information', async () => {
      client.setArgv('unlink', '--help');
      const exitCodePromise = unlink(client);
      await expect(exitCodePromise).resolves.toEqual(2);
    });
  });

  describe('when project is not linked', () => {
    it('should show error message', async () => {
      const cwd = setupTmpDir();
      client.cwd = cwd;
      client.setArgv('unlink');
      const exitCodePromise = unlink(client);

      await expect(client.stderr).toOutput(
        'This directory is not linked to a Vercel Project.'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(1);
    });
  });

  describe('when project is linked', () => {
    async function setupLinkedProject(cwd: string) {
      const user = useUser();
      useTeams('team_dummy');
      const { project } = useProject({
        ...defaultProject,
        id: basename(cwd),
        name: basename(cwd),
      });

      // Create .vercel directory and files
      const vercelDir = join(cwd, '.vercel');
      await mkdirp(vercelDir);

      // Create project.json
      await writeJSON(join(vercelDir, 'project.json'), {
        orgId: user.id,
        projectId: project.id,
        projectName: project.name,
      });

      // Create README.txt
      await writeFile(join(vercelDir, 'README.txt'), 'Test readme content');

      return { user, project };
    }

    it('should unlink project successfully with confirmation', async () => {
      const cwd = setupTmpDir();
      client.cwd = cwd;
      const { user, project } = await setupLinkedProject(cwd);

      client.setArgv('unlink');
      const exitCodePromise = unlink(client);

      await expect(client.stderr).toOutput(
        `Unlinked from ${user.username}/${project.name} (removed .vercel)`
      );

      const exitCode = await exitCodePromise;

      // Verify confirmation prompt was called
      expect(client.input.confirm).toHaveBeenCalledWith(
        `Are you sure you want to unlink this directory from ${user.username}/${project.name}?`,
        true
      );
      expect(exitCode).toEqual(0);

      // Verify .vercel directory was removed
      expect(await pathExists(join(cwd, '.vercel'))).toBe(false);
    });

    it('should unlink project successfully with --yes flag', async () => {
      const cwd = setupTmpDir();
      client.cwd = cwd;
      const { user, project } = await setupLinkedProject(cwd);

      client.setArgv('unlink', '--yes');
      const exitCodePromise = unlink(client);

      await expect(client.stderr).toOutput(
        `Unlinked from ${user.username}/${project.name} (removed .vercel)`
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      // Verify no confirmation prompts were called
      expect(client.input.confirm).not.toHaveBeenCalled();

      // Verify .vercel directory was removed
      expect(await pathExists(join(cwd, '.vercel'))).toBe(false);
    });

    it('should cancel when user declines unlink confirmation', async () => {
      const cwd = setupTmpDir();
      client.cwd = cwd;
      await setupLinkedProject(cwd);

      // Mock user declining the unlink confirmation
      client.input.confirm = vi.fn().mockResolvedValue(false);

      client.setArgv('unlink');
      const exitCodePromise = unlink(client);

      await expect(client.stderr).toOutput('Canceled.');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      // Verify .vercel directory still exists
      expect(await pathExists(join(cwd, '.vercel'))).toBe(true);
    });
  });
});
