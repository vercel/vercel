import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';
import list, {
  stateString,
  getDeploymentDuration,
} from '../../../src/commands/list';
import { join } from 'path';
import { useTeams } from '../../mocks/team';
import { defaultProject, useProject } from '../../mocks/project';
import { useDeployment } from '../../mocks/deployment';
import { Deployment } from '../../../src/types';

const fixture = (name: string) =>
  join(__dirname, '../../fixtures/unit/commands/list', name);

describe('list', () => {
  const originalCwd = process.cwd();
  let teamSlug: string = '';

  it('should get deployments from a project linked by a directory', async () => {
    const cwd = fixture('link');
    try {
      process.chdir(cwd);

      const user = await useUser();
      const team = useTeams('team_MtLD9hKuWAvoDd3KmiHs9zUg');
      teamSlug = team[0].slug;
      const project = useProject({
        ...defaultProject,
        id: 'prj_Am19DF8JBL9g89tn4RdDVD59axFi',
        name: 'prj_Am19DF8JBL9g89tn4RdDVD59axFi',
      });
      const deployment = useDeployment({ creator: user });

      await list(client);

      const { project: proj, org } = getDataFromIntro(
        client.outputBuffer.split('\n')[0]
      );
      const header: string[] = formatTable(client.outputBuffer.split('\n')[3]);
      const data: string[] = formatTable(client.outputBuffer.split('\n')[4]);
      data.shift();

      expect(proj).toEqual(project.project.name);
      expect(org).toEqual(team[0].slug);
      expect(header).toEqual([
        'age',
        'deployment url',
        'state',
        'duration',
        'username',
      ]);

      expect(data).toEqual([
        `https://${deployment.url}`,
        stateString(deployment.state || ''),
        getDeploymentDuration(deployment as unknown as Deployment),
        user.name,
      ]);
    } finally {
      process.chdir(originalCwd);
    }
  });
  it('should get all deployments in the project scope', async () => {
    const cwd = fixture('all');
    try {
      process.chdir(cwd);

      const user = useUser();
      useTeams('team_MtLD9hKuWAvoDd3KmiHs9zUg');
      useProject({
        ...defaultProject,
        id: 'proj-all',
        name: 'proj-all',
      });
      const deployment = useDeployment({ creator: user });

      client.setArgv('--all');
      await list(client);
      console.log(client.outputBuffer);
      const { project, org } = getDataFromIntro(
        client.outputBuffer.split('\n')[0]
      );
      const header: string[] = formatTable(client.outputBuffer.split('\n')[2]);
      const data: string[] = formatTable(client.outputBuffer.split('\n')[3]);
      data.pop();

      expect(project).toBeUndefined();
      expect(org).toEqual(teamSlug);
      expect(header).toEqual(['project', 'latest deployment', 'state', 'age']);
      expect(data).toEqual([
        deployment.name,
        `https://${deployment.url}`,
        stateString(deployment.state || ''),
      ]);
    } finally {
      process.chdir(originalCwd);
    }
  });
  it('should get the deployments for a specified project', async () => {
    const cwd = fixture('specify-project');
    try {
      process.chdir(cwd);

      const user = useUser();
      useTeams('team_MtLD9hKuWAvoDd3KmiHs9zUg');
      useProject({
        ...defaultProject,
        id: 'specify-project',
        name: 'specify-project',
      });
      const deployment = useDeployment({ creator: user });

      client.setArgv(deployment.name);
      await list(client);

      const { project, org } = getDataFromIntro(
        client.outputBuffer.split('\n')[0]
      );
      const header: string[] = formatTable(client.outputBuffer.split('\n')[3]);
      const data: string[] = formatTable(client.outputBuffer.split('\n')[4]);
      data.shift();

      expect(project).toEqual(deployment.name);
      expect(org).toEqual(teamSlug);

      expect(header).toEqual([
        'age',
        'deployment url',
        'state',
        'duration',
        'username',
      ]);
      expect(data).toEqual([
        `https://${deployment.url}`,
        stateString(deployment.state || ''),
        getDeploymentDuration(deployment as unknown as Deployment),
        user.name,
      ]);
    } finally {
      process.chdir(originalCwd);
    }
  });
});

function getDataFromIntro(output: string): {
  project: string | undefined;
  org: string | undefined;
} {
  const project = output.match(/(?<=Deployments for )(.*)(?= under)/);
  const org = output.match(/(?<=under )(.*)(?= \[)/);

  return {
    project: project?.[0],
    org: org?.[0],
  };
}

function formatTable(output: string): string[] {
  return output
    .trim()
    .replace(/ {3} +/g, ',')
    .split(',');
}
