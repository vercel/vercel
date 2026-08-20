import { afterEach, describe, expect, it, beforeEach } from 'vitest';
import flags from '../../../../src/commands/flags';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { useFlags } from '../../../mocks/flags';
import type { Flag } from '../../../../src/util/flags/types';

// Helper to create fresh flag data for each test
function createTestFlags(): Flag[] {
  return [
    {
      id: 'flag_abc123',
      slug: 'my-feature',
      description: 'My awesome feature flag',
      kind: 'boolean',
      state: 'active',
      variants: [
        { id: 'off', value: false, label: 'Off' },
        { id: 'on', value: true, label: 'On' },
      ],
      environments: {
        production: {
          active: true,
          fallthrough: { type: 'variant', variantId: 'off' },
          pausedOutcome: { type: 'variant', variantId: 'off' },
          rules: [],
        },
        preview: {
          active: true,
          fallthrough: { type: 'variant', variantId: 'on' },
          pausedOutcome: { type: 'variant', variantId: 'off' },
          rules: [],
        },
        development: {
          active: true,
          fallthrough: { type: 'variant', variantId: 'on' },
          pausedOutcome: { type: 'variant', variantId: 'off' },
          rules: [],
        },
      },
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 3600000,
      createdBy: 'user_123',
      projectId: 'vercel-flags-test',
      ownerId: 'team_dummy',
      revision: 1,
      seed: 12345,
      typeName: 'flag',
    },
  ];
}

describe('flags rm', () => {
  let testFlags: Flag[];
  let productionEvaluations: number;

  beforeEach(() => {
    testFlags = createTestFlags();
    productionEvaluations = 0;
    process.env.VERCEL_FLAG_EVALUATIONS_API_URL = new URL(
      '/api/observability/metrics',
      client.apiUrl
    ).href;
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
    });
    client.scenario.post('/api/observability/metrics', (_req, res) => {
      res.json({
        data: [],
        summary: productionEvaluations
          ? [
              {
                vercel_flag_evaluation_flag_evaluations_sum:
                  productionEvaluations,
              },
            ]
          : [],
      });
    });
    client.scenario.get(
      '/projects/vercel-flags-test/production-deployment',
      (_req, res) => {
        res.json({ deployment: { id: 'dpl_active_production' } });
      }
    );
    client.scenario.get(
      '/v1/deployments/dpl_active_production/feature-flags',
      (_req, res) => {
        res.json({ flags: [], status: { responseStatus: 200 } });
      }
    );
    useFlags(testFlags);
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.cwd = cwd;
  });

  afterEach(() => {
    delete process.env.VERCEL_FLAG_EVALUATIONS_API_URL;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'flags';
      const subcommand = 'rm';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = flags(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  it('tracks `rm` subcommand', async () => {
    // Flag must be archived to be deleted
    testFlags[0].state = 'archived';

    client.setArgv('flags', 'rm', testFlags[0].slug, '--yes');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:rm',
        value: 'rm',
      },
      {
        key: 'argument:flag',
        value: '[REDACTED]',
      },
      {
        key: 'flag:yes',
        value: 'TRUE',
      },
    ]);
  });

  it('deletes an archived flag successfully with --yes', async () => {
    // Flag must be archived to be deleted
    testFlags[0].state = 'archived';

    client.setArgv('flags', 'rm', testFlags[0].slug, '--yes');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
  });

  it('blocks deletion when the flag has recent production evaluations', async () => {
    testFlags[0].state = 'archived';
    productionEvaluations = 2;
    client.setArgv('flags', 'rm', testFlags[0].slug, '--yes');

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      '2 production evaluations in the last 72 hours'
    );
    expect(client.stderr.getFullOutput()).toContain(
      'To override this check, rerun with vercel flags rm my-feature --yes --dangerously-force'
    );
  });

  it('provides agents structured JSON output for safety blockers', async () => {
    testFlags[0].state = 'archived';
    productionEvaluations = 2;
    client.isAgent = true;
    client.nonInteractive = true;
    client.setArgv('flags', 'rm', testFlags[0].slug, '--yes');

    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);

    const payload = JSON.parse(client.stdout.getFullOutput());
    // Note: stderr may contain progress messages before the agent error
    expect(payload).toMatchObject({
      status: 'error',
      reason: 'production_safety_check_failed',
      message: expect.stringContaining(
        '2 production evaluations in the last 72 hours'
      ),
      next: [
        {
          command: 'vercel flags rm my-feature --yes --dangerously-force',
          when: 'override the production safety check',
        },
      ],
    });
  });

  it('errors in non-interactive mode without --yes', async () => {
    testFlags[0].state = 'archived';
    (client.stdin as any).isTTY = false;
    client.setArgv('flags', 'rm', testFlags[0].slug);

    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Missing required flag --yes'
    );
  });

  it('errors when flag is not archived', async () => {
    // testFlags[0] has state: 'active' by default
    client.setArgv('flags', 'rm', testFlags[0].slug, '--yes');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain('must be archived');
  });

  it('errors without flag argument', async () => {
    client.setArgv('flags', 'rm');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
  });

  it('errors when flag is not found', async () => {
    client.setArgv('flags', 'rm', 'nonexistent-flag', '--yes');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain('Flag not found');
  });

  it('uses warning gutter for forced override notices', async () => {
    testFlags[0].state = 'archived';
    productionEvaluations = 2;
    client.setArgv(
      'flags',
      'rm',
      testFlags[0].slug,
      '--yes',
      '--dangerously-force'
    );

    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(client.stdout.getFullOutput()).not.toContain(
      'Deleting my-feature despite production activity'
    );
    expect(client.stderr.getFullOutput()).toContain(
      'Deleting my-feature despite production activity'
    );
    expect(client.stderr.getFullOutput()).toContain(
      'This action cannot be undone'
    );
  });

  it('does not warn about a forced deletion when confirmation is declined', async () => {
    testFlags[0].state = 'archived';
    productionEvaluations = 2;
    (client.stdin as any).isTTY = true;
    client.input.confirm = async () => false;
    client.setArgv('flags', 'rm', testFlags[0].slug, '--dangerously-force');

    const exitCode = await flags(client);

    expect(exitCode).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain('Aborted');
    expect(client.stderr.getFullOutput()).not.toContain(
      'Deleting my-feature despite production activity'
    );
  });

  it('rechecks safety after interactive confirmation', async () => {
    testFlags[0].state = 'archived';
    productionEvaluations = 0;
    (client.stdin as any).isTTY = true;
    client.input.confirm = async () => {
      // Simulate evaluations starting during the confirmation prompt
      productionEvaluations = 3;
      return true;
    };

    client.setArgv('flags', 'rm', testFlags[0].slug);
    const exitCode = await flags(client);

    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'is now in use in Production'
    );
    expect(client.stderr.getFullOutput()).toContain('3 production evaluations');
  });
});
