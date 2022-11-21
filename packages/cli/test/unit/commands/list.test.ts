import createLineIterator from 'line-async-iterator';
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

      const lines = createLineIterator(client.stderr);

      let line = await lines.next();
      expect(line.value).toEqual('Retrieving project…');

      line = await lines.next();
      expect(line.value).toEqual(`Fetching deployments in ${team[0].slug}`);

      line = await lines.next();
      const { org } = pluckIdentifiersFromDeploymentList(line.value!);
      expect(org).toEqual(team[0].slug);

      // skip next line
      await lines.next();

      line = await lines.next();
      expect(line.value).toEqual('');

      line = await lines.next();
      const header = parseSpacedTableRow(line.value!);
      expect(header).toEqual([
        'Age',
        'Deployment',
        'Status',
        'Duration',
        'Username',
      ]);

      line = await lines.next();
      const data = parseSpacedTableRow(line.value!);
      data.shift();
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

      const lines = createLineIterator(client.stderr);

      let line = await lines.next();
      expect(line.value).toEqual('Retrieving project…');

      line = await lines.next();
      expect(line.value).toEqual(`Fetching deployments in ${user.username}`);

      line = await lines.next();
      const { org } = pluckIdentifiersFromDeploymentList(line.value!);
      expect(org).toEqual(user.username);

      // skip next line
      await lines.next();

      line = await lines.next();
      expect(line.value).toEqual('');

      line = await lines.next();
      const header = parseSpacedTableRow(line.value!);
      expect(header).toEqual(['Age', 'Deployment', 'Status', 'Duration']);

      line = await lines.next();
      const data = parseSpacedTableRow(line.value!);
      data.shift();

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

      const lines = createLineIterator(client.stderr);

      let line = await lines.next();
      expect(line.value).toEqual('Retrieving project…');

      line = await lines.next();
      expect(line.value).toEqual(
        `Fetching deployments in ${teamSlug || team[0].slug}`
      );

      line = await lines.next();
      const { org } = pluckIdentifiersFromDeploymentList(line.value!);
      expect(org).toEqual(teamSlug || team[0].slug);

      // skip next line
      await lines.next();

      line = await lines.next();
      expect(line.value).toEqual('');

      line = await lines.next();
      const header = parseSpacedTableRow(line.value!);
      expect(header).toEqual([
        'Age',
        'Deployment',
        'Status',
        'Duration',
        'Username',
      ]);

      line = await lines.next();
      const data = parseSpacedTableRow(line.value!);
      data.shift();
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
