import { beforeEach, describe, expect, it } from 'vitest';
import integrationResourceCommand from '../../../../src/commands/integration-resource';
import { client } from '../../../mocks/client';
import { useResources } from '../../../mocks/integration';
import { type Team, useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

const resource = 'store-acme-connected-project';

type Conflict = {
  projectId: string;
  projectName: string;
  connectionId: string;
  key: string;
  envVarId?: string;
  environments: string[];
  managedBy?: { storeId?: string };
  orphaned?: true;
};

const conflict: Conflict = {
  projectId: 'prj_connected',
  projectName: 'connected-project',
  connectionId: 'spc_1',
  key: 'ACME_URL',
  envVarId: 'env_1',
  environments: ['production'],
};

const orphaned: Conflict = {
  projectId: 'prj_other',
  projectName: 'other-project',
  connectionId: 'spc_2',
  key: 'ACME_TOKEN',
  envVarId: 'env_2',
  environments: ['preview'],
  orphaned: true,
};

function outcome(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    connectionCount: 2,
    appliedConnectionCount: 2,
    conflicts: [],
    hiddenConflictCount: 0,
    overwritten: [],
    reclaimed: [],
    hiddenReclaimedCount: 0,
    ...overrides,
  };
}

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

    // Mirrors the API: unmanaged conflicts are overwritten with
    // overwriteConflicts, orphaned ones are always reclaimed, and a real run
    // with remaining conflicts applies what it can and responds with a 409.
    function mockSync({
      conflicts = [],
      canOverwrite = true,
    }: {
      conflicts?: Conflict[];
      canOverwrite?: boolean;
    }) {
      client.scenario.post(
        '/v1/integrations/installations/:installationId/resources/:resourceId/secrets/sync',
        (req, res) => {
          syncRequests.push(req.body);
          const overwrite = req.body.overwriteConflicts === true;
          const reclaimable = (c: Conflict) =>
            c.orphaned || (overwrite && !c.managedBy);
          const blocking = conflicts.filter(c => !reclaimable(c));
          const reclaimed = conflicts.filter(reclaimable);
          const result = outcome({
            appliedConnectionCount:
              2 - new Set(blocking.map(c => c.connectionId)).size,
            conflicts: blocking,
            overwritten: reclaimed.filter(c => !c.orphaned),
            reclaimed: reclaimed.filter(c => c.orphaned),
          });
          if (req.body.dryRun) {
            res.json({ dryRun: true, ...result });
            return;
          }
          if (blocking.length > 0) {
            res.status(409).json({
              error: {
                code: 'secrets_env_var_conflicts',
                message: 'New secrets were applied to 1 of 2 connections.',
                secretsUpdated: true,
                canOverwrite: canOverwrite && !overwrite,
                ...result,
              },
            });
            return;
          }
          res.json({ dryRun: false, ...result });
        }
      );
    }

    it('applies secrets when there are no conflicts', async () => {
      mockSync({});
      client.setArgv('integration-resource', 'sync-secrets', resource);
      const exitCodePromise = integrationResourceCommand(client);

      await expect(client.stderr).toOutput(
        `> Success! Applied the current secrets for ${resource} to 2 project connections.`
      );
      await expect(exitCodePromise).resolves.toEqual(0);
      expect(syncRequests).toEqual([{ overwriteConflicts: false }]);
    });

    it('reports reclaimed env vars left over from a removed integration', async () => {
      mockSync({ conflicts: [orphaned] });
      client.setArgv('integration-resource', 'sync-secrets', resource);
      const exitCodePromise = integrationResourceCommand(client);

      await expect(exitCodePromise).resolves.toEqual(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Replaced environment variables:');
      expect(stderr).toContain(
        'other-project  ACME_TOKEN  (preview)  left over from a removed integration'
      );
    });

    it('applies secrets where it can and reports conflicts without --overwrite-conflicts', async () => {
      mockSync({ conflicts: [conflict] });
      client.setArgv('integration-resource', 'sync-secrets', resource);
      const exitCodePromise = integrationResourceCommand(client);

      await expect(exitCodePromise).resolves.toEqual(1);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('connected-project  ACME_URL  (production)');
      expect(stderr).toContain(
        `Applied the current secrets for ${resource} to 1 of 2 project connections.`
      );
      expect(stderr).toContain(
        'Re-run with `--overwrite-conflicts` to replace them.'
      );
      expect(syncRequests).toEqual([{ overwriteConflicts: false }]);
    });

    it('explains when conflicts cannot be overwritten due to permissions', async () => {
      mockSync({ conflicts: [conflict], canOverwrite: false });
      client.setArgv('integration-resource', 'sync-secrets', resource);
      const exitCodePromise = integrationResourceCommand(client);

      await expect(exitCodePromise).resolves.toEqual(1);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        "You don't have permission to remove these environment variables."
      );
      expect(stderr).not.toContain('--overwrite-conflicts');
    });

    it('previews and overwrites conflicts after confirmation', async () => {
      mockSync({ conflicts: [conflict] });
      client.setArgv(
        'integration-resource',
        'sync-secrets',
        resource,
        '--overwrite-conflicts'
      );
      const exitCodePromise = integrationResourceCommand(client);

      await expect(client.stderr).toOutput(
        'These environment variables will be replaced:'
      );
      await expect(client.stderr).toOutput('? Are you sure? (y/N)');
      client.stdin.write('y\n');
      await expect(client.stderr).toOutput('> Success!');
      await expect(exitCodePromise).resolves.toEqual(0);
      expect(client.stderr.getFullOutput()).toContain(
        'connected-project  ACME_URL  (production)'
      );
      expect(syncRequests).toEqual([
        { dryRun: true, overwriteConflicts: true },
        { overwriteConflicts: true },
      ]);
    });

    it('skips the preview with --yes', async () => {
      mockSync({ conflicts: [conflict] });
      client.setArgv(
        'integration-resource',
        'sync-secrets',
        resource,
        '--overwrite-conflicts',
        '--yes'
      );
      const exitCodePromise = integrationResourceCommand(client);

      await expect(client.stderr).toOutput('> Success!');
      await expect(exitCodePromise).resolves.toEqual(0);
      expect(client.stderr.getFullOutput()).not.toContain('Are you sure?');
      expect(syncRequests).toEqual([{ overwriteConflicts: true }]);
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

      await expect(exitCodePromise).resolves.toEqual(1);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        'connected-project  ACME_URL  (production)  managed by another resource or integration'
      );
      expect(stderr).toContain(
        'Disconnect it from the project, then try again.'
      );
      expect(syncRequests).toEqual([{ overwriteConflicts: true }]);
    });

    it('writes the partial result as JSON when conflicts remain', async () => {
      mockSync({ conflicts: [conflict] });
      client.setArgv(
        'integration-resource',
        'sync-secrets',
        resource,
        '--format',
        'json'
      );
      const exitCodePromise = integrationResourceCommand(client);

      await expect(exitCodePromise).resolves.toEqual(1);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
        resource,
        synced: false,
        canOverwrite: true,
        ...outcome({ appliedConnectionCount: 1, conflicts: [conflict] }),
      });
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
        ...outcome({ appliedConnectionCount: 1, conflicts: [conflict] }),
      });
      expect(syncRequests).toEqual([
        { dryRun: true, overwriteConflicts: false },
      ]);
    });

    it('previews the overwrite with --dry-run --overwrite-conflicts', async () => {
      mockSync({ conflicts: [conflict] });
      client.setArgv(
        'integration-resource',
        'sync-secrets',
        resource,
        '--dry-run',
        '--overwrite-conflicts'
      );
      const exitCodePromise = integrationResourceCommand(client);

      await expect(exitCodePromise).resolves.toEqual(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        'would apply its current secrets to 2 of 2 project connections'
      );
      expect(stderr).toContain('Environment variables that would be replaced:');
      expect(stderr).toContain('No conflicting environment variables found.');
      expect(syncRequests).toEqual([
        { dryRun: true, overwriteConflicts: true },
      ]);
    });

    it('reports a rotation in progress', async () => {
      client.scenario.post(
        '/v1/integrations/installations/:installationId/resources/:resourceId/secrets/sync',
        (_req, res) => {
          res.status(409).json({
            error: {
              code: 'store_rotation_in_progress',
              message: 'A secrets rotation is already in progress.',
            },
          });
        }
      );
      client.setArgv('integration-resource', 'sync-secrets', resource);
      const exitCodePromise = integrationResourceCommand(client);

      await expect(client.stderr).toOutput(
        'A secrets rotation is already in progress.'
      );
      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('errors when the resource does not exist', async () => {
      client.setArgv('integration-resource', 'sync-secrets', 'missing');
      const exitCodePromise = integrationResourceCommand(client);

      await expect(client.stderr).toOutput('No resource missing found.');
      await expect(exitCodePromise).resolves.toEqual(1);
    });
  });
});
