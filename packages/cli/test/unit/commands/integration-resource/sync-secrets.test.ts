import { beforeEach, describe, expect, it } from 'vitest';
import integrationResourceCommand from '../../../../src/commands/integration-resource';
import { client } from '../../../mocks/client';
import { useResources } from '../../../mocks/integration';
import { type Team, useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

const resource = 'store-acme-connected-project';

const conflict = {
  projectId: 'prj_connected',
  projectName: 'connected-project',
  connectionId: 'spc_1',
  key: 'ACME_URL',
  envVarId: 'env_1',
  environments: ['production'],
};

describe('integration-resource', () => {
  describe('sync-secrets', () => {
    let syncRequests: { dryRun?: boolean; overwriteConflicts?: boolean }[];

    beforeEach(() => {
      useUser();
      const teams = useTeams('team_dummy');
      const team: Team = Array.isArray(teams) ? teams[0] : teams.teams[0];
      client.config.currentTeam = team.id;
      useResources();
      syncRequests = [];
    });

    function mockSync(options: {
      conflicts?: (typeof conflict & { managedBy?: { storeId: string } })[];
    }) {
      client.scenario.post(
        '/v1/integrations/installations/:installationId/resources/:resourceId/secrets/sync',
        (req, res) => {
          syncRequests.push(req.body);
          const conflicts = options.conflicts ?? [];
          if (req.body.dryRun) {
            res.json({
              dryRun: true,
              connectionCount: 1,
              conflicts,
              hiddenConflictCount: 0,
            });
            return;
          }
          res.json({
            dryRun: false,
            connectionCount: 1,
            conflicts,
            hiddenConflictCount: 0,
          });
        }
      );
    }

    it('applies secrets when there are no conflicts', async () => {
      mockSync({});
      client.setArgv('integration-resource', 'sync-secrets', resource);
      const exitCodePromise = integrationResourceCommand(client);

      await expect(client.stderr).toOutput(
        `> Success! Applied the current secrets for ${resource} to 1 project connection.`
      );
      await expect(exitCodePromise).resolves.toEqual(0);
      expect(syncRequests).toEqual([
        { dryRun: true },
        { overwriteConflicts: false },
      ]);
    });

    it('fails on conflicts without --overwrite-conflicts', async () => {
      mockSync({ conflicts: [conflict] });
      client.setArgv('integration-resource', 'sync-secrets', resource);
      const exitCodePromise = integrationResourceCommand(client);

      await expect(client.stderr).toOutput('connected-project  ACME_URL');
      await expect(client.stderr).toOutput('--overwrite-conflicts');
      await expect(exitCodePromise).resolves.toEqual(1);
      expect(syncRequests).toEqual([{ dryRun: true }]);
    });

    it('overwrites conflicts after confirmation', async () => {
      mockSync({ conflicts: [conflict] });
      client.setArgv(
        'integration-resource',
        'sync-secrets',
        resource,
        '--overwrite-conflicts'
      );
      const exitCodePromise = integrationResourceCommand(client);

      await expect(client.stderr).toOutput('? Are you sure? (y/N)');
      client.stdin.write('y\n');
      await expect(client.stderr).toOutput('> Success!');
      await expect(exitCodePromise).resolves.toEqual(0);
      expect(syncRequests).toEqual([
        { dryRun: true },
        { overwriteConflicts: true },
      ]);
    });

    it('never overwrites env vars managed by another resource', async () => {
      mockSync({
        conflicts: [{ ...conflict, managedBy: { storeId: 'store_other' } }],
      });
      client.setArgv(
        'integration-resource',
        'sync-secrets',
        resource,
        '--overwrite-conflicts',
        '--yes'
      );
      const exitCodePromise = integrationResourceCommand(client);

      await expect(client.stderr).toOutput(
        'managed by another resource or integration and cannot be overwritten'
      );
      await expect(exitCodePromise).resolves.toEqual(1);
      expect(syncRequests).toEqual([{ dryRun: true }]);
    });

    it('only reports conflicts with --dry-run', async () => {
      mockSync({ conflicts: [conflict] });
      client.setArgv(
        'integration-resource',
        'sync-secrets',
        resource,
        '--dry-run',
        '--format',
        'json'
      );
      const exitCodePromise = integrationResourceCommand(client);

      await expect(exitCodePromise).resolves.toEqual(0);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
        dryRun: true,
        connectionCount: 1,
        conflicts: [conflict],
        hiddenConflictCount: 0,
      });
      expect(syncRequests).toEqual([{ dryRun: true }]);
    });

    it('errors when the resource does not exist', async () => {
      client.setArgv('integration-resource', 'sync-secrets', 'missing');
      const exitCodePromise = integrationResourceCommand(client);

      await expect(client.stderr).toOutput('No resource missing found.');
      await expect(exitCodePromise).resolves.toEqual(1);
    });
  });
});
