import { describe, it, expect } from 'vitest';
import { defaultProject, useProject } from '../../../mocks/project';
import { client } from '../../../mocks/client';
import type { Project } from '@vercel-internals/types';
import projects from '../../../../src/commands/project';
import { useUser } from '../../../mocks/user';

describe('add', () => {
  describe('[name]', () => {
    it('should add a project', async () => {
      const user = useUser();
      useProject({
        ...defaultProject,
        id: 'test-project',
        name: 'test-project',
      });

      client.setArgv('project', 'add', 'test-project');
      await projects(client);

      const project: Project = await client.fetch(`/v8/projects/test-project`);
      expect(project).toBeDefined();

      expect(client.stderr).toOutput(
        `Success! Project test-project added (${user.username})`
      );
    });
  });
});
