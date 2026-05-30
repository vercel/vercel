import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import open from 'open';
import integrationResourceCommand from '../../../../src/commands/integration-resource';
import { client } from '../../../mocks/client';
import { type Team, useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import type { Resource } from '../../../../src/util/integration-resource/types';

vi.mock('open', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

const openMock = vi.mocked(open);

const SANDBOX_RESOURCE: Resource = {
  id: 'store_stripe_sandbox',
  type: 'integration',
  name: 'my-stripe',
  status: 'available',
  ownership: 'sandbox',
  product: {
    name: 'Stripe',
    slug: 'stripe',
    integrationConfigurationId: 'icfg_stripe',
  },
  projectsMetadata: [],
  externalResourceId: 'ext_stripe_sandbox',
};

const LINKED_RESOURCE: Resource = {
  ...SANDBOX_RESOURCE,
  ownership: 'linked',
  externalResourceId: 'acct_real_stripe',
};

const OWNED_RESOURCE: Resource = {
  id: 'store_postgres_owned',
  type: 'integration',
  name: 'prod-postgres',
  status: 'available',
  ownership: 'owned',
  product: {
    name: 'Postgres',
    slug: 'neon',
    integrationConfigurationId: 'icfg_neon',
  },
  projectsMetadata: [],
  externalResourceId: 'ext_postgres',
};

const SECOND_SANDBOX_RESOURCE: Resource = {
  id: 'store_shopify_sandbox',
  type: 'integration',
  name: 'my-shop',
  status: 'available',
  ownership: 'sandbox',
  product: {
    name: 'Shopify',
    slug: 'shopify',
    integrationConfigurationId: 'icfg_shopify',
  },
  projectsMetadata: [],
  externalResourceId: 'ext_shopify_sandbox',
};

function mockStores(stores: Resource[]) {
  client.scenario.get('/:version/storage/stores', (_req, res) => {
    res.json({ stores });
  });
}

function mockStoresSequence(sequences: Resource[][]) {
  let index = 0;
  client.scenario.get('/:version/storage/stores', (_req, res) => {
    const stores = sequences[Math.min(index, sequences.length - 1)];
    index++;
    res.json({ stores });
  });
}

function mockClaimUrl(
  url = 'https://stripe.com/claim/sandbox-token',
  options?: { status?: number; body?: object }
) {
  client.scenario.post(
    '/v1/integrations/installations/:icfgId/resources/:rid/sandbox/claim-url',
    (_req, res) => {
      if (options?.status && options.status >= 400) {
        return res
          .status(options.status)
          .json(options.body ?? { error: { message: 'mock_error' } });
      }
      return res.json({ claimUrl: url });
    }
  );
}

beforeEach(() => {
  openMock.mockReset().mockResolvedValue(undefined as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('integration-resource claim', () => {
  let team: Team;

  beforeEach(() => {
    useUser();
    const teams = useTeams('team_dummy');
    team = Array.isArray(teams) ? teams[0] : teams.teams[0];
    client.config.currentTeam = team.id;
  });

  describe('happy path (TTY)', () => {
    it('claims a sandbox resource by name and polls to completion', async () => {
      mockStoresSequence([
        [SANDBOX_RESOURCE, OWNED_RESOURCE], // initial fetch (find target)
        [LINKED_RESOURCE, OWNED_RESOURCE], // first poll iteration: linked!
      ]);
      mockClaimUrl();

      client.setArgv('integration-resource', 'claim', 'my-stripe');
      const exitCodePromise = integrationResourceCommand(client);

      await expect(client.stderr).toOutput(
        'Opening browser to claim my-stripe'
      );
      await expect(client.stderr).toOutput('Success! Claimed my-stripe');

      expect(await exitCodePromise).toEqual(0);
      expect(openMock).toHaveBeenCalledWith(
        'https://stripe.com/claim/sandbox-token'
      );
    }, 30000);

    it('--format=json writes claimed status to stdout', async () => {
      mockStoresSequence([[SANDBOX_RESOURCE], [LINKED_RESOURCE]]);
      mockClaimUrl('https://stripe.com/claim/abc');

      client.setArgv(
        'integration-resource',
        'claim',
        'my-stripe',
        '--format=json'
      );
      const exitCode = await integrationResourceCommand(client);
      expect(exitCode).toEqual(0);

      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json).toEqual({
        resource: { id: 'store_stripe_sandbox', name: 'my-stripe' },
        claimUrl: 'https://stripe.com/claim/abc',
        status: 'claimed',
      });
    }, 30000);

    it('--no-wait prints URL and exits 0 without polling', async () => {
      mockStores([SANDBOX_RESOURCE]);
      mockClaimUrl('https://stripe.com/claim/xyz');

      client.setArgv('integration-resource', 'claim', 'my-stripe', '--no-wait');
      const exitCode = await integrationResourceCommand(client);
      expect(exitCode).toEqual(0);
      expect(openMock).toHaveBeenCalledWith('https://stripe.com/claim/xyz');
    });
  });

  describe('picker (no arg, TTY)', () => {
    it('shows picker when 2+ sandbox resources exist', async () => {
      mockStoresSequence([
        [SANDBOX_RESOURCE, SECOND_SANDBOX_RESOURCE, OWNED_RESOURCE],
        [LINKED_RESOURCE, SECOND_SANDBOX_RESOURCE, OWNED_RESOURCE],
      ]);
      mockClaimUrl();

      client.setArgv('integration-resource', 'claim');
      const exitCodePromise = integrationResourceCommand(client);

      await expect(client.stderr).toOutput(
        'Which sandbox resource would you like to claim?'
      );
      client.stdin.write('\n'); // select first option (my-stripe)

      await expect(client.stderr).toOutput(
        'Opening browser to claim my-stripe'
      );
      await expect(client.stderr).toOutput('Success! Claimed my-stripe');

      expect(await exitCodePromise).toEqual(0);
    }, 30000);

    it('shows confirm when exactly 1 sandbox resource exists', async () => {
      mockStoresSequence([
        [SANDBOX_RESOURCE, OWNED_RESOURCE],
        [LINKED_RESOURCE, OWNED_RESOURCE],
      ]);
      mockClaimUrl();

      client.setArgv('integration-resource', 'claim');
      const exitCodePromise = integrationResourceCommand(client);

      await expect(client.stderr).toOutput('Claim my-stripe (Stripe sandbox)?');
      client.stdin.write('\n'); // accept default (yes)

      await expect(client.stderr).toOutput(
        'Opening browser to claim my-stripe'
      );
      expect(await exitCodePromise).toEqual(0);
    }, 30000);

    it('exits 0 with informational message when no sandbox resources exist', async () => {
      mockStores([OWNED_RESOURCE]);

      client.setArgv('integration-resource', 'claim');
      const exitCodePromise = integrationResourceCommand(client);

      await expect(client.stderr).toOutput(
        'No sandbox resources to claim in the current project.'
      );

      expect(await exitCodePromise).toEqual(0);
    });
  });

  describe('non-TTY', () => {
    it('emits action_required payload and exits 1 for claim <name>', async () => {
      mockStores([SANDBOX_RESOURCE]);
      mockClaimUrl('https://stripe.com/claim/non-tty');

      (client.stdin as any).isTTY = false;
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('__exit__');
      }) as never);

      client.setArgv(
        'integration-resource',
        'claim',
        'my-stripe',
        '--non-interactive'
      );

      await expect(integrationResourceCommand(client)).rejects.toThrow(
        '__exit__'
      );

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'integration_sandbox_claim_required',
        verification_uri: 'https://stripe.com/claim/non-tty',
        userActionRequired: true,
      });
      expect(payload.next?.[0]?.command).toContain('integration list');
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });

    it('errors when no resource name is given in non-TTY', async () => {
      mockStores([SANDBOX_RESOURCE]);

      (client.stdin as any).isTTY = false;
      client.setArgv('integration-resource', 'claim');
      const exitCodePromise = integrationResourceCommand(client);

      await expect(client.stderr).toOutput(
        'Missing resource name. Run `vercel integration list` to see available resources.'
      );

      expect(await exitCodePromise).toEqual(1);
    });
  });

  describe('errors', () => {
    it('errors when there is no team', async () => {
      client.config.currentTeam = undefined;
      mockStores([SANDBOX_RESOURCE]);

      client.setArgv('integration-resource', 'claim', 'my-stripe');
      const exitCode = await integrationResourceCommand(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Error: Team not found.');
    });

    it('errors when the resource is not found', async () => {
      mockStores([SANDBOX_RESOURCE]);

      client.setArgv('integration-resource', 'claim', 'does-not-exist');
      const exitCodePromise = integrationResourceCommand(client);
      await expect(client.stderr).toOutput(
        "No resource named 'does-not-exist' found."
      );
      expect(await exitCodePromise).toEqual(1);
    });

    it('errors cleanly when target is not a sandbox resource', async () => {
      mockStores([OWNED_RESOURCE]);

      client.setArgv('integration-resource', 'claim', 'prod-postgres');
      const exitCodePromise = integrationResourceCommand(client);
      await expect(client.stderr).toOutput(
        "'prod-postgres' is not a sandbox resource and cannot be claimed"
      );
      expect(await exitCodePromise).toEqual(1);
    });

    it('maps API 400 not-a-sandbox to a clean error', async () => {
      mockStores([SANDBOX_RESOURCE]);
      mockClaimUrl(undefined, {
        status: 400,
        body: { error: { message: 'Resource ownership is not sandbox' } },
      });

      client.setArgv('integration-resource', 'claim', 'my-stripe');
      const exitCodePromise = integrationResourceCommand(client);
      await expect(client.stderr).toOutput(
        "Error: 'my-stripe' is not a sandbox resource and cannot be claimed."
      );
      expect(await exitCodePromise).toEqual(1);
    });

    it('maps API 403 to a clean permission error', async () => {
      mockStores([SANDBOX_RESOURCE]);
      mockClaimUrl(undefined, {
        status: 403,
        body: { error: { message: 'forbidden' } },
      });

      client.setArgv('integration-resource', 'claim', 'my-stripe');
      const exitCodePromise = integrationResourceCommand(client);
      await expect(client.stderr).toOutput(
        "Error: You don't have permission to claim resources in this team."
      );
      expect(await exitCodePromise).toEqual(1);
    });
  });

  describe('telemetry', () => {
    it('tracks subcommand and flags', async () => {
      mockStores([SANDBOX_RESOURCE]);
      mockClaimUrl();

      client.setArgv('integration-resource', 'claim', 'my-stripe', '--no-wait');
      await integrationResourceCommand(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:claim', value: 'claim' },
        { key: 'flag:no-wait', value: 'TRUE' },
        { key: 'argument:resource', value: '[REDACTED]' },
      ]);
    });
  });
});
