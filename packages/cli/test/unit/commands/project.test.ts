import createLineIterator from 'line-async-iterator';
import projects from '../../../src/commands/project';
import { useUser } from '../../mocks/user';
import { useTeams } from '../../mocks/team';
import { defaultProject, useProject } from '../../mocks/project';
import { client } from '../../mocks/client';
import type { Project } from '@vercel-internals/types';
import { parseSpacedTableRow } from '../../helpers/parse-table';
import { vi } from 'vitest';

describe('project', () => {
  describe('list', () => {
    it('should list projects', async () => {
      const user = useUser();
      useTeams('team_dummy');
      const project = useProject({
        ...defaultProject,
      });

      client.setArgv('project', 'ls');
      await projects(client);

      const lines = createLineIterator(client.stderr);

      let line = await lines.next();
      expect(line.value).toEqual(`Fetching projects in ${user.username}`);

      line = await lines.next();
      expect(line.value).toContain(user.username);

      // empty line
      line = await lines.next();
      expect(line.value).toEqual('');

      line = await lines.next();
      const header = parseSpacedTableRow(line.value!);
      expect(header).toEqual([
        'Project Name',
        'Latest Production URL',
        'Updated',
      ]);

      line = await lines.next();
      const data = parseSpacedTableRow(line.value!);
      data.pop();
      expect(data).toEqual([project.project.name, 'https://foobar.com']);
    });

    it('should list projects running on an soon-to-be-deprecated Node.js version', async () => {
      vi.useFakeTimers().setSystemTime(new Date('2023-12-08'));

      const user = useUser();
      useTeams('team_dummy');
      const project = useProject({
        ...defaultProject,
        nodeVersion: '16.x',
      });

      client.setArgv('project', 'ls', '--update-required');
      await projects(client);

      const lines = createLineIterator(client.stderr);

      let line = await lines.next();
      expect(line.value).toEqual(`Fetching projects in ${user.username}`);

      line = await lines.next();
      expect(line.value).toEqual(
        'WARN! The following Node.js versions will be deprecated soon: 16.x. Please upgrade your projects immediately.'
      );
      line = await lines.next();
      expect(line.value).toEqual(
        '> For more information visit: https://vercel.com/docs/functions/serverless-functions/runtimes/node-js#node.js-version'
      );
      line = await lines.next();
      expect(line.value).toContain(user.username);

      // empty line
      line = await lines.next();
      expect(line.value).toEqual('');

      line = await lines.next();
      const header = parseSpacedTableRow(line.value!);
      expect(header).toEqual([
        'Project Name',
        'Latest Production URL',
        'Updated',
      ]);

      line = await lines.next();
      const data = parseSpacedTableRow(line.value!);
      data.pop();
      expect(data).toEqual([project.project.name, 'https://foobar.com']);

      vi.clearAllTimers();
    });

    it('should list projects when there is no production deployment', async () => {
      const user = useUser();
      useTeams('team_dummy');
      defaultProject.alias = [];
      const project = useProject({
        ...defaultProject,
      });

      client.setArgv('project', 'ls');
      await projects(client);

      const lines = createLineIterator(client.stderr);

      let line = await lines.next();
      expect(line.value).toEqual(`Fetching projects in ${user.username}`);

      line = await lines.next();
      expect(line.value).toContain(user.username);

      // empty line
      line = await lines.next();
      expect(line.value).toEqual('');

      line = await lines.next();
      const header = parseSpacedTableRow(line.value!);
      expect(header).toEqual([
        'Project Name',
        'Latest Production URL',
        'Updated',
      ]);

      line = await lines.next();
      const data = parseSpacedTableRow(line.value!);
      data.pop();
      expect(data).toEqual([project.project.name, '--']);
    });
  });

  describe('add', () => {
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

  describe('rm', () => {
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
