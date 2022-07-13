import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';
import list, {
  getDeploymentDuration,
  stateString,
} from '../../../src/commands/list';
import { join } from 'path';
import { useTeams } from '../../mocks/team';
import { defaultProject, useProject } from '../../mocks/project';
import { useDeployment } from '../../mocks/deployment';
import { readOutputStream } from '../../helpers/read-output-stream';
import {
  parseSpacedTableRow,
  pluckIdentifiersFromDeploymentList,
} from '../../helpers/parse-table';
import { Deployment } from '../../../src/types';

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

      const output = await readOutputStream(client, 4);

      const { org } = pluckIdentifiersFromDeploymentList(output.split('\n')[0]);
      const header: string[] = parseSpacedTableRow(output.split('\n')[3]);
      const data: string[] = parseSpacedTableRow(output.split('\n')[4]);
      data.shift();

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

      const output = await readOutputStream(client, 4);

      const { org } = pluckIdentifiersFromDeploymentList(output.split('\n')[0]);
      const header: string[] = parseSpacedTableRow(output.split('\n')[3]);
      const data: string[] = parseSpacedTableRow(output.split('\n')[4]);
      data.shift();

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
