import { describe, it, expect } from 'vitest';
import createLineIterator from 'line-async-iterator';
import projects from '../../../../src/commands/project';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { defaultProject, useProject } from '../../../mocks/project';
import { client } from '../../../mocks/client';

import { parseSpacedTableRow } from '../../../helpers/parse-table';

describe('list', () => {
  describe.todo('--update-required');
  describe.todo('--next');

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

  it('should list projects when there is no production deployment', async () => {
    const user = useUser();
    useTeams('team_dummy');
    const project = useProject({
      ...defaultProject,
      targets: {
        production: {
          ...defaultProject!.targets!.production,
          alias: [],
        },
      },
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
