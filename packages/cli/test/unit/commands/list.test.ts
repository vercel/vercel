import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';
import list, { stateString } from '../../../src/commands/list';
import { join } from 'path';
import { useTeams } from '../../mocks/team';
import { defaultProject, useProject } from '../../mocks/project';
import { useDeployment } from '../../mocks/deployment';
import { parseTable, getDataFromIntro } from '../../helpers/parse-table';

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
      const team = useTeams('team_dummy');
      teamSlug = team[0].slug;
      useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      const deployment = useDeployment({ creator: user });

      await list(client);

      const [line0, , line2, line3] = client.outputBuffer.split('\n');
      const { org } = getDataFromIntro(line0);
      const header: string[] = parseTable(line2);
      const data: string[] = parseTable(line3);
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
  it('should get the deployments for a specified project', async () => {
    const cwd = fixture('with-team');
    try {
      process.chdir(cwd);

      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      const deployment = useDeployment({ creator: user });

      client.setArgv(deployment.name);
      await list(client);

      const [line0, , line2, line3] = client.outputBuffer.split('\n');
      const { org } = getDataFromIntro(line0);
      const header: string[] = parseTable(line2);
      const data: string[] = parseTable(line3);
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
