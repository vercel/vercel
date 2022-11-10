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

const fixture = (name: string) =>
  join(__dirname, '../../fixtures/unit/commands/list', name);

describe('list', () => {
  const originalCwd = process.cwd();
  let teamSlug: string;

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

      const output = await readOutputStream(client, 6);

      const { org } = pluckIdentifiersFromDeploymentList(output.split('\n')[2]);
      const header: string[] = parseSpacedTableRow(output.split('\n')[5]);
      const data: string[] = parseSpacedTableRow(output.split('\n')[6]);
      data.shift();

      expect(org).toEqual(team[0].slug);
      expect(header).toEqual([
        'Age',
        'Deployment',
        'Status',
        'Duration',
        'Username',
      ]);

      expect(data).toEqual([
        `https://${deployment.url}`,
        stateString(deployment.state || ''),
        getDeploymentDuration(deployment),
        user.username,
      ]);
    } finally {
      process.chdir(originalCwd);
    }
  });
  it('should get deployments for linked project where the scope is a user', async () => {
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

      client.setArgv('-S', user.username);
      await list(client);

      const output = await readOutputStream(client, 6);

      const { org } = pluckIdentifiersFromDeploymentList(output.split('\n')[2]);
      const header: string[] = parseSpacedTableRow(output.split('\n')[5]);
      const data: string[] = parseSpacedTableRow(output.split('\n')[6]);
      data.shift();

      expect(org).toEqual(user.username);
      expect(header).toEqual(['Age', 'Deployment', 'Status', 'Duration']);
      expect(data).toEqual([
        'https://' + deployment.url,
        stateString(deployment.state || ''),
        getDeploymentDuration(deployment),
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
      const team = useTeams('team_dummy');
      useProject({
        ...defaultProject,
        id: 'with-team',
        name: 'with-team',
      });
      const deployment = useDeployment({ creator: user });

      client.setArgv(deployment.name);
      await list(client);

      const output = await readOutputStream(client, 6);

      const { org } = pluckIdentifiersFromDeploymentList(output.split('\n')[2]);
      const header: string[] = parseSpacedTableRow(output.split('\n')[5]);
      const data: string[] = parseSpacedTableRow(output.split('\n')[6]);
      data.shift();

      expect(org).toEqual(teamSlug || team[0].slug);

      expect(header).toEqual([
        'Age',
        'Deployment',
        'Status',
        'Duration',
        'Username',
      ]);
      expect(data).toEqual([
        `https://${deployment.url}`,
        stateString(deployment.state || ''),
        getDeploymentDuration(deployment),
        user.username,
      ]);
    } finally {
      process.chdir(originalCwd);
    }
  });
});
