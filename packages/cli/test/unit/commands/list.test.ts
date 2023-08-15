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
  let teamSlug: string;

  it.skip('should get deployments from a project linked by a directory', async () => {
    const user = useUser();
    const team = useTeams('team_dummy');
    teamSlug = team[0].slug;
    useProject({
      ...defaultProject,
      id: 'with-team',
      name: 'with-team',
    });
    const deployment = useDeployment({ creator: user });

    client.cwd = fixture('with-team');
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
      'Environment',
      'Duration',
      'Username',
    ]);

    line = await lines.next();
    const data = parseSpacedTableRow(line.value!);
    data.shift();
    expect(data).toEqual([
      `https://${deployment.url}`,
      stateString(deployment.state || ''),
      deployment.target === 'production' ? 'Production' : 'Preview',
      getDeploymentDuration(deployment),
      user.username,
    ]);
  });

  it.skip('should get deployments for linked project where the scope is a user', async () => {
    const user = useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'with-team',
      name: 'with-team',
    });
    const deployment = useDeployment({ creator: user });

    client.cwd = fixture('with-team');
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
    expect(header).toEqual([
      'Age',
      'Deployment',
      'Status',
      'Environment',
      'Duration',
    ]);

    line = await lines.next();
    const data = parseSpacedTableRow(line.value!);
    data.shift();

    expect(data).toEqual([
      'https://' + deployment.url,
      stateString(deployment.state || ''),
      deployment.target === 'production' ? 'Production' : 'Preview',
      getDeploymentDuration(deployment),
    ]);
  });

  it.skip('should get the deployments for a specified project', async () => {
    const user = useUser();
    const team = useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'with-team',
      name: 'with-team',
    });
    const deployment = useDeployment({ creator: user });

    client.cwd = fixture('with-team');
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
      'Environment',
      'Duration',
      'Username',
    ]);

    line = await lines.next();
    const data = parseSpacedTableRow(line.value!);
    data.shift();
    expect(data).toEqual([
      `https://${deployment.url}`,
      stateString(deployment.state || ''),
      deployment.target === 'production' ? 'Production' : 'Preview',
      getDeploymentDuration(deployment),
      user.username,
    ]);
  });

  it.skip('should output deployment URLs to stdout', async () => {
    const user = useUser();
    useProject({
      ...defaultProject,
      id: 'with-team',
      name: 'with-team',
    });
    const prodDeployment = useDeployment({
      creator: user,
      createdAt: Date.now() - 1000,
      target: 'production',
    });
    const previewDeployment = useDeployment({
      creator: user,
      createdAt: Date.now(),
      target: undefined,
    });

    client.stdout.isTTY = false;
    client.cwd = fixture('with-team');

    // run with all deployments
    let prom = list(client);
    await expect(client.stdout).toOutput(
      `https://${previewDeployment.url}\nhttps://${prodDeployment.url}`
    );
    await prom;

    // run again with preview deployments only
    client.setArgv('--environment', 'preview');
    prom = list(client);
    await expect(client.stdout).toOutput(`https://${previewDeployment.url}`);
    await prom;

    // run again with production deployments only
    client.setArgv('--environment', 'production');
    prom = list(client);
    await expect(client.stdout).toOutput(`https://${prodDeployment.url}`);
    await prom;
  });
});
