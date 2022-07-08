import projects from '../../../src/commands/project';
import { useUser } from '../../mocks/user';
import { useTeams } from '../../mocks/team';
import { defaultProject, useProject } from '../../mocks/project';
import { client } from '../../mocks/client';
import { Project } from '../../../src/types';
import { readOutputStream } from '../../helpers/read-output-stream';
import { getDataFromIntro, parseTable } from '../../helpers/parse-table';

describe('projects', () => {
  describe('list', () => {
    it('should list deployments under a user', async () => {
      const user = useUser();
      const project = useProject({
        ...defaultProject,
      });

      client.setArgv('project', 'ls');
      await projects(client);

      const output = await readOutputStream(client, 2);
      const { org } = getDataFromIntro(output.split('\n')[0]);
      const header: string[] = parseTable(output.split('\n')[2]);
      const data: string[] = parseTable(output.split('\n')[3]);
      data.pop();

      expect(org).toEqual(user.username);
      expect(header).toEqual(['name', 'updated']);
      expect(data).toEqual([project.project.name]);
    });
    it('should list deployments for a team', async () => {
      useUser();
      const team = useTeams('team_dummy');
      const project = useProject({
        ...defaultProject,
      });

      client.config.currentTeam = team[0].id;
      client.setArgv('project', 'ls');
      await projects(client);

      const output = await readOutputStream(client, 2);
      const { org } = getDataFromIntro(output.split('\n')[0]);
      const header: string[] = parseTable(output.split('\n')[2]);
      const data: string[] = parseTable(output.split('\n')[3]);
      data.pop();

      expect(org).toEqual(team[0].slug);
      expect(header).toEqual(['name', 'updated']);
      expect(data).toEqual([project.project.name]);
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
