import { beforeEach, describe, expect, it } from 'vitest';
import integrationCommand from '../../../../src/commands/integration';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { useResources } from '../../../mocks/integration';
import { defaultProject, useProject } from '../../../mocks/project';
import { type Team, useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import createLineIterator from 'line-async-iterator';
import { parseSpacedTableRow } from '../../../helpers/parse-table';

describe('integration', () => {
  describe('list', () => {
    beforeEach(() => {
      useUser();
    });

    describe('table responses', () => {
      let team: Team;
      beforeEach(() => {
        const teams = useTeams('team_dummy');
        team = Array.isArray(teams) ? teams[0] : teams.teams[0];
        client.config.currentTeam = team.id;
        const cwd = setupUnitFixture('commands/integration/list');
        client.cwd = cwd;
        useResources();
        useProject({
          ...defaultProject,
          id: 'prj_connected',
          name: 'connected-project',
        });
      });

      it('returns only marketplace resources for the linked project', async () => {
        client.setArgv('integration', 'list');
        const exitCodePromise = integrationCommand(client);
        await expect(exitCodePromise).resolves.toEqual(0);
        const lines = createLineIterator(client.stderr);

        let line = await lines.next();
        expect(line.value).toEqual('Retrieving project…');

        line = await lines.next();
        expect(line.value).toEqual('Retrieving resources…');

        line = await lines.next();
        expect(line.value).toEqual(`> Integrations in ${team.slug}:`);

        line = await lines.next();
        const header = parseSpacedTableRow(line.value ?? '');
        expect(header).toEqual([
          'Name',
          'Status',
          'Product',
          'Integration',
          'Projects',
        ]);

        line = await lines.next();
        let data = parseSpacedTableRow(line.value ?? '');
        expect(data).toEqual([
          'store-acme-connected-project',
          '–',
          'Acme',
          'acme',
          'connected-project',
        ]);

        line = await lines.next();
        data = parseSpacedTableRow(line.value ?? '');
        expect(data).toEqual([
          'store-foo-bar-both-projects',
          '● Initializing',
          'Foo Bar',
          'foo-bar',
          'connected-project',
          ' other-project',
        ]);
      });

      it('returns all projects with the --all flag', async () => {
        client.setArgv('integration', 'list', '--all');
        const exitCodePromise = integrationCommand(client);
        await expect(exitCodePromise).resolves.toEqual(0);
        const lines = createLineIterator(client.stderr);

        let line = await lines.next();
        expect(line.value).toEqual('Retrieving resources…');

        line = await lines.next();
        expect(line.value).toEqual(`> Integrations in ${team.slug}:`);

        line = await lines.next();
        const header = parseSpacedTableRow(line.value ?? '');
        expect(header).toEqual([
          'Name',
          'Status',
          'Product',
          'Integration',
          'Projects',
        ]);

        line = await lines.next();
        let data = parseSpacedTableRow(line.value ?? '');
        expect(data).toEqual([
          'store-acme-connected-project',
          '–',
          'Acme',
          'acme',
          'connected-project',
        ]);

        line = await lines.next();
        data = parseSpacedTableRow(line.value ?? '');
        expect(data).toEqual([
          'store-acme-other-project',
          '● Available',
          'Acme',
          'acme',
          'other-project',
        ]);

        line = await lines.next();
        data = parseSpacedTableRow(line.value ?? '');
        expect(data).toEqual([
          'store-foo-bar-both-projects',
          '● Initializing',
          'Foo Bar',
          'foo-bar',
          'connected-project',
          ' other-project',
        ]);

        line = await lines.next();
        data = parseSpacedTableRow(line.value ?? '');
        expect(data).toEqual([
          'store-acme-no-projects',
          '● Available',
          'Acme',
          'acme',
          '–',
        ]);
      });

      it('returns only the selected integration when filtering', async () => {
        client.setArgv('integration', 'list', '--integration', 'acme');
        const exitCodePromise = integrationCommand(client);
        await expect(exitCodePromise).resolves.toEqual(0);
        const lines = createLineIterator(client.stderr);

        let line = await lines.next();
        expect(line.value).toEqual('Retrieving project…');

        line = await lines.next();
        expect(line.value).toEqual('Retrieving resources…');

        line = await lines.next();
        expect(line.value).toEqual(`> Integrations in ${team.slug}:`);

        line = await lines.next();
        const header = parseSpacedTableRow(line.value ?? '');
        expect(header).toEqual([
          'Name',
          'Status',
          'Product',
          'Integration',
          'Projects',
        ]);

        line = await lines.next();
        const data = parseSpacedTableRow(line.value ?? '');
        expect(data).toEqual([
          'store-acme-connected-project',
          '–',
          'Acme',
          'acme',
          'connected-project',
        ]);
      });

      it('handles --integration and --all flags simultaneously', async () => {
        client.setArgv('integration', 'list', '--all', '--integration', 'acme');
        const exitCodePromise = integrationCommand(client);
        await expect(exitCodePromise).resolves.toEqual(0);
        const lines = createLineIterator(client.stderr);

        let line = await lines.next();
        expect(line.value).toEqual('Retrieving resources…');

        line = await lines.next();
        expect(line.value).toEqual(`> Integrations in ${team.slug}:`);

        line = await lines.next();
        const header = parseSpacedTableRow(line.value ?? '');
        expect(header).toEqual([
          'Name',
          'Status',
          'Product',
          'Integration',
          'Projects',
        ]);

        line = await lines.next();
        let data = parseSpacedTableRow(line.value ?? '');
        expect(data).toEqual([
          'store-acme-connected-project',
          '–',
          'Acme',
          'acme',
          'connected-project',
        ]);

        line = await lines.next();
        data = parseSpacedTableRow(line.value ?? '');
        expect(data).toEqual([
          'store-acme-other-project',
          '● Available',
          'Acme',
          'acme',
          'other-project',
        ]);

        line = await lines.next();
        data = parseSpacedTableRow(line.value ?? '');
        expect(data).toEqual([
          'store-acme-no-projects',
          '● Available',
          'Acme',
          'acme',
          '–',
        ]);
      });
    });

    describe('errors', () => {
      it('should error when there is no team', async () => {
        client.setArgv('integration', 'list');
        const exitCodePromise = integrationCommand(client);
        await expect(exitCodePromise).resolves.toEqual(1);
        await expect(client.stderr).toOutput('Error: Team not found.');
      });

      it('should error when no project linked and no project specified', async () => {
        const teams = useTeams('team_dummy');
        const team = Array.isArray(teams) ? teams[0] : teams.teams[0];
        client.config.currentTeam = team.id;

        const cwd = setupUnitFixture('commands/integration/list');
        client.cwd = cwd;

        client.setArgv('integration', 'list');
        const exitCodePromise = integrationCommand(client);
        await expect(exitCodePromise).resolves.toEqual(1);
        await expect(client.stderr).toOutput(
          'Error: No project linked. Either use `vc link` to link a project, or the `--all` flag to list all resources.'
        );
      });

      it('should error when multiple arguments passed', async () => {
        const teams = useTeams('team_dummy');
        const team = Array.isArray(teams) ? teams[0] : teams.teams[0];
        client.config.currentTeam = team.id;
        const cwd = setupUnitFixture('commands/integration/list');
        client.cwd = cwd;

        client.setArgv(
          'integration',
          'list',
          'current-project',
          'other-project'
        );
        const exitCodePromise = integrationCommand(client);
        await expect(exitCodePromise).resolves.toEqual(1);
        await expect(client.stderr).toOutput(
          'Error: Cannot specify more than one project at a time. Use `--all` to show all resources.'
        );
      });

      it('should error when an argument is passed with the --all flag at the same time', async () => {
        const teams = useTeams('team_dummy');
        const team = Array.isArray(teams) ? teams[0] : teams.teams[0];
        client.config.currentTeam = team.id;
        const cwd = setupUnitFixture('commands/integration/list');
        client.cwd = cwd;

        client.setArgv('integration', 'list', 'other-project', '--all');
        const exitCodePromise = integrationCommand(client);
        await expect(exitCodePromise).resolves.toEqual(1);
        await expect(client.stderr).toOutput(
          'Error: Cannot specify a project when using the `--all` flag.'
        );
      });
    });
  });
});
