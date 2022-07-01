import { client, MockClient } from '../../mocks/client';
import { useUser } from '../../mocks/user';
import list, { stateString } from '../../../src/commands/list';
import { join } from 'path';
import { useTeams } from '../../mocks/team';
import { defaultProject, useProject } from '../../mocks/project';
import { useDeployment } from '../../mocks/deployment';

const fixture = (name: string) =>
  join(__dirname, '../../fixtures/unit/commands/list', name);

describe('list', () => {
  const originalCwd = process.cwd();
  let teamSlug: string = '';

  it('should get deployments from a project linked by a directory', async () => {
    const cwd = fixture('with-team');
    try {
      process.chdir(cwd);

      const user = useUser();
      const team = useTeams('team_MtLD9hKuWAvoDd3KmiHs9zUg');
      teamSlug = team[0].slug;
      useProject({
        ...defaultProject,
        id: 'prj_Am19DF8JBL9g89tn4RdDVD59axFi',
        name: 'prj_Am19DF8JBL9g89tn4RdDVD59axFi',
      });
      const deployment = useDeployment({ creator: user });

      await list(client);

      const output = await readOutputStream(client);

      const { org } = getDataFromIntro(output.split('\n')[0]);
      const header: string[] = parseTable(output.split('\n')[2]);
      const data: string[] = parseTable(output.split('\n')[3]);
      data.splice(2, 1);

      expect(org).toEqual(team[0].slug);
      expect(header).toEqual([
        'project',
        'latest deployment',
        'state',
        'age',
        'username',
      ]);

      expect(data).toEqual([
        deployment.url,
        stateString(deployment.state || ''),
        user.name,
      ]);
    } finally {
      process.chdir(originalCwd);
    }
  });
  it('should get all deployments in the project scope', async () => {
    const cwd = fixture('with-team');
    try {
      process.chdir(cwd);

      const user = useUser();
      useTeams('team_MtLD9hKuWAvoDd3KmiHs9zUg');
      useProject({
        ...defaultProject,
        id: 'prj_Am19DF8JBL9g89tn4RdDVD59axFi',
        name: 'prj_Am19DF8JBL9g89tn4RdDVD59axFi',
      });
      const deployment = useDeployment({ creator: user });

      client.setArgv('--all');
      await list(client);

      const output = await readOutputStream(client);

      const { project, org } = getDataFromIntro(output.split('\n')[0]);
      const header: string[] = parseTable(output.split('\n')[2]);
      const data: string[] = parseTable(output.split('\n')[3]);
      data.splice(2, 1);

      expect(project).toBeUndefined();
      expect(org).toEqual(teamSlug);
      expect(header).toEqual([
        'project',
        'latest deployment',
        'state',
        'age',
        'username',
      ]);
      expect(data).toEqual([
        deployment.url,
        stateString(deployment.state || ''),
        user.name,
      ]);
    } finally {
      process.chdir(originalCwd);
    }
  });
  it('should get the deployments for a specified project', async () => {
    const cwd = fixture('with-team');
    try {
      process.chdir(cwd);

      const user = useUser();
      useTeams('team_MtLD9hKuWAvoDd3KmiHs9zUg');
      useProject({
        ...defaultProject,
        id: 'prj_Am19DF8JBL9g89tn4RdDVD59axFi',
        name: 'prj_Am19DF8JBL9g89tn4RdDVD59axFi',
      });
      const deployment = useDeployment({ creator: user });

      client.setArgv(deployment.name);
      await list(client);

      const output = await readOutputStream(client);

      const { org } = getDataFromIntro(output.split('\n')[0]);
      const header: string[] = parseTable(output.split('\n')[2]);
      const data: string[] = parseTable(output.split('\n')[3]);
      data.splice(2, 1);

      expect(org).toEqual(teamSlug);

      expect(header).toEqual([
        'project',
        'latest deployment',
        'state',
        'age',
        'username',
      ]);
      expect(data).toEqual([
        deployment.url,
        stateString(deployment.state || ''),
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

function parseTable(output: string): string[] {
  return output
    .trim()
    .replace(/ {3} +/g, ',')
    .split(',');
}

function readOutputStream(client: MockClient): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    client.stderr.resume();
    client.stderr.on('data', chunk => {
      chunks.push(chunk);
      if (chunks.length === 3) {
        resolve(chunks.toString().replace(/,/g, ''));
      }
    });
    setTimeout(() => {
      reject();
    }, 3000);
    client.stderr.on('error', reject);
  });
}
