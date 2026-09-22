import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import integrationResourceCommand from '../../../../src/commands/integration-resource';
import { client } from '../../../mocks/client';
import { type Team, useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import type { Resource } from '../../../../src/util/integration-resource/types';

// Listed via the stores endpoint (DB-cached). Its `status` is intentionally
// stale so tests can prove the live per-store fetch overrides it.
const LISTED_RESOURCE: Resource = {
  id: 'store_acme',
  type: 'integration',
  name: 'my-acme',
  status: 'initializing',
  ownership: 'owned',
  product: {
    name: 'Acme',
    slug: 'acme',
    integrationConfigurationId: 'icfg_acme',
  },
  projectsMetadata: [
    {
      id: 'spc_1',
      projectId: 'prj_1',
      name: 'web-app',
      environments: ['production', 'preview'],
    },
  ],
  externalResourceId: 'ext_acme',
};

// Fresh from the partner via the per-store endpoint: status has advanced.
const LIVE_RESOURCE: Resource = {
  ...LISTED_RESOURCE,
  status: 'available',
};

function mockStores(stores: Resource[]) {
  client.scenario.get('/:version/storage/stores', (_req, res) => {
    res.json({ stores });
  });
}

/** Mocks the per-store endpoint (`GET /v1/storage/stores/:id`) live fetch. */
function mockResource(store: Resource) {
  client.scenario.get('/:version/storage/stores/:rid', (_req, res) => {
    res.json({ store });
  });
}

function mockResourceError(status = 500) {
  client.scenario.get('/:version/storage/stores/:rid', (_req, res) => {
    res.status(status).end();
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('integration-resource inspect', () => {
  let team: Team;

  beforeEach(() => {
    useUser();
    const teams = useTeams('team_dummy');
    team = Array.isArray(teams) ? teams[0] : teams.teams[0];
    client.config.currentTeam = team.id;
  });

  it('resolves a resource by name and shows the live status, not the stale list status', async () => {
    mockStores([LISTED_RESOURCE]);
    mockResource(LIVE_RESOURCE);

    client.setArgv('integration-resource', 'inspect', 'my-acme');
    const exitCode = await integrationResourceCommand(client);
    expect(exitCode).toEqual(0);

    const out = client.stderr.getFullOutput();
    // Live status from the per-store endpoint wins over the list's stale value.
    expect(out).toContain('Available');
    expect(out).not.toContain('Initializing');
    expect(out).toContain('Acme');
    expect(out).toContain('web-app');
    // Dashboard row shows the full URL, not just the resource name.
    expect(out).toContain(
      `https://vercel.com/${team.slug}/~/stores/integration/store_acme`
    );
  });

  it('works via the `status` alias', async () => {
    mockStores([LISTED_RESOURCE]);
    mockResource(LIVE_RESOURCE);

    client.setArgv('integration-resource', 'status', 'my-acme');
    const exitCode = await integrationResourceCommand(client);
    expect(exitCode).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain('Available');
  });

  it('tracks subcommand telemetry', async () => {
    mockStores([LISTED_RESOURCE]);
    mockResource(LIVE_RESOURCE);

    client.setArgv('integration-resource', 'inspect', 'my-acme');
    const exitCode = await integrationResourceCommand(client);
    expect(exitCode).toEqual(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:inspect',
        value: 'inspect',
      },
      {
        key: 'argument:resource',
        value: '[REDACTED]',
      },
    ]);
  });

  it('outputs the resource shape as JSON with the live status', async () => {
    mockStores([LISTED_RESOURCE]);
    mockResource(LIVE_RESOURCE);

    client.setArgv(
      'integration-resource',
      'inspect',
      'my-acme',
      '--format=json'
    );
    const exitCode = await integrationResourceCommand(client);
    expect(exitCode).toEqual(0);

    const json = JSON.parse(client.stdout.getFullOutput());
    expect(json).toEqual({
      resource: {
        id: 'store_acme',
        name: 'my-acme',
        status: 'available',
        ownership: 'owned',
        product: 'Acme',
        integration: 'acme',
        installationId: 'icfg_acme',
        projects: [
          {
            id: 'prj_1',
            name: 'web-app',
            environments: ['production', 'preview'],
          },
        ],
        billingPlan: null,
        dashboard: `https://vercel.com/${team.slug}/~/stores/integration/store_acme`,
      },
    });
  });

  it('marks sandbox resources with a claim hint', async () => {
    const sandboxListed: Resource = {
      ...LISTED_RESOURCE,
      id: 'store_stripe',
      name: 'my-stripe',
      ownership: 'sandbox',
    };
    mockStores([sandboxListed]);
    mockResource({ ...sandboxListed, status: 'available' });

    client.setArgv('integration-resource', 'inspect', 'my-stripe');
    const exitCode = await integrationResourceCommand(client);
    expect(exitCode).toEqual(0);

    const out = client.stderr.getFullOutput();
    expect(out).toContain('[SANDBOX]');
    expect(out).toContain('resource claim my-stripe');
  });

  it('errors when the resource is not found', async () => {
    mockStores([LISTED_RESOURCE]);

    client.setArgv('integration-resource', 'inspect', 'does-not-exist');
    const exitCode = await integrationResourceCommand(client);
    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'No resource does-not-exist found'
    );
  });

  it('errors when the live per-store fetch fails', async () => {
    mockStores([LISTED_RESOURCE]);
    mockResourceError(500);

    client.setArgv('integration-resource', 'inspect', 'my-acme');
    const exitCode = await integrationResourceCommand(client);
    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Failed to fetch live status for my-acme'
    );
  });

  it('errors when no resource is specified', async () => {
    client.setArgv('integration-resource', 'inspect');
    const exitCode = await integrationResourceCommand(client);
    expect(exitCode).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'You must specify a resource'
    );
  });
});
