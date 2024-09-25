import { describe, it, expect } from 'vitest';
import { useUser } from '../../../mocks/user';
import projects from '../../../../src/commands/project';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';

describe('rm', () => {
  describe('[name]', () => {
    it('should remove a project', async () => {
      useUser();
      useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
      });

      client.setArgv('project', 'rm', 'test-project');
      const projectsPromise = projects(client);

      await expect(client.stderr).toOutput(
        `The project test-project will be removed permanently.`
      );
      client.stdin.write('y\n');

      const exitCode = await projectsPromise;
      expect(exitCode).toEqual(0);
    });
  });
});
