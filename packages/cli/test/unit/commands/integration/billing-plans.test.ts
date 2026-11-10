import { beforeEach, describe, expect, it, vi } from 'vitest';
import integrationCommand from '../../../../src/commands/integration';
import { fetchBillingPlans } from '../../../../src/util/integration/fetch-billing-plans';
import { client } from '../../../mocks/client';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

vi.mock(
  '../../../../src/util/integration/fetch-billing-plans',
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import('../../../../src/util/integration/fetch-billing-plans')
      >();
    return { fetchBillingPlans: vi.fn(actual.fetchBillingPlans) };
  }
);

const emptySchema = { type: 'object', properties: {} };

const integrations: Record<string, unknown> = {
  neon: {
    id: 'oac_neon',
    slug: 'neon',
    name: 'Neon',
    products: [
      {
        id: 'iap_neon',
        slug: 'neon',
        name: 'Neon Postgres',
        shortDescription: 'Serverless Postgres',
        metadataSchema: emptySchema,
      },
    ],
  },
  aws: {
    id: 'oac_aws',
    slug: 'aws',
    name: 'AWS',
    products: [
      {
        id: 'iap_s3',
        slug: 'aws-s3',
        name: 'Amazon S3',
        shortDescription: 'Object storage',
        metadataSchema: emptySchema,
      },
      {
        id: 'iap_dynamodb',
        slug: 'aws-dynamodb',
        name: 'Amazon DynamoDB',
        shortDescription: 'NoSQL',
        metadataSchema: emptySchema,
      },
    ],
  },
  // One product lists plans, the other's plans request fails.
  mixed: {
    id: 'oac_mixed',
    slug: 'mixed',
    name: 'Mixed',
    products: [
      {
        id: 'iap_neon',
        slug: 'mixed-ok',
        name: 'Mixed OK',
        metadataSchema: emptySchema,
      },
      {
        id: 'iap_partner_down',
        slug: 'mixed-down',
        name: 'Mixed Down',
        metadataSchema: emptySchema,
      },
    ],
  },
  'neon-empty': {
    id: 'oac_neon_empty',
    slug: 'neon-empty',
    name: 'Neon Empty',
    products: [
      {
        id: 'iap_neon_empty',
        slug: 'neon-empty',
        name: 'Neon Empty',
        metadataSchema: emptySchema,
      },
    ],
  },
  'no-list': {
    id: 'oac_no_list',
    slug: 'no-list',
    name: 'No List',
    products: [
      {
        id: 'iap_no_list',
        slug: 'no-list',
        name: 'No List',
        metadataSchema: emptySchema,
      },
    ],
  },
  // Both products' plans requests fail.
  'all-down': {
    id: 'oac_all_down',
    slug: 'all-down',
    name: 'All Down',
    products: [
      {
        id: 'iap_down_a',
        slug: 'down-a',
        name: 'Down A',
        metadataSchema: emptySchema,
      },
      {
        id: 'iap_down_b',
        slug: 'down-b',
        name: 'Down B',
        metadataSchema: emptySchema,
      },
    ],
  },
  // Its plans request fails: `plansByProductId` has no entry for it.
  'partner-down': {
    id: 'oac_partner_down',
    slug: 'partner-down',
    name: 'Partner Down',
    products: [
      {
        id: 'iap_partner_down',
        slug: 'partner-down',
        name: 'Partner Down',
        metadataSchema: emptySchema,
      },
    ],
  },
  // Lists plans only once it knows the region, like AWS.
  cloud: {
    id: 'oac_cloud',
    slug: 'cloud',
    name: 'Cloud',
    metadataSchema: {
      type: 'object',
      properties: { org: { type: 'string', 'ui:control': 'input' } },
    },
    products: [
      {
        id: 'iap_cloud_storage',
        slug: 'cloud-storage',
        name: 'Cloud Storage',
        metadataSchema: {
          type: 'object',
          properties: {
            region: {
              type: 'string',
              'ui:control': 'vercel-region',
              'ui:options': ['iad1', 'sfo1'],
            },
            internal: {
              type: 'string',
              'ui:control': 'input',
              'ui:hidden': 'create',
            },
            tier: {
              type: 'string',
              'ui:control': 'input',
              default: 'standard',
            },
          },
          required: ['region', 'internal', 'tier', 'undeclared'],
        },
      },
    ],
  },
  external: {
    id: 'oac_external',
    slug: 'external',
    name: 'External',
  },
};

function plan(overrides: Record<string, unknown> & { id: string }) {
  return {
    type: 'subscription',
    name: overrides.id,
    scope: 'resource',
    description: '',
    paymentMethodRequired: true,
    details: [],
    ...overrides,
  };
}

const neonPlans = [
  plan({
    id: 'free_v3',
    name: 'Free',
    description: 'For side projects',
    paymentMethodRequired: false,
  }),
  plan({ id: 'launch', name: 'Launch', cost: '$19/month' }),
  plan({ id: 'legacy', name: 'Legacy', disabled: true }),
];

const plansByProductId: Record<string, unknown> = {
  iap_neon: neonPlans,
  iap_s3: [
    plan({
      id: 's3-plan',
      name: 'S3',
      cost: ' ',
      details: [{ label: 'Storage', value: '$0.023 per GB/month' }],
    }),
  ],
  iap_dynamodb: [
    plan({ id: 'dynamodb-plan', name: 'DynamoDB', type: 'prepayment' }),
  ],
  iap_neon_empty: [],
  iap_no_list: null,
};

function usePlans() {
  const requests: { path: string; query: Record<string, unknown> }[] = [];
  client.scenario.get('/v2/integrations/integration/:slug', (req, res) => {
    const integration = integrations[req.params.slug];
    if (!integration) {
      res
        .status(404)
        .json({ error: { code: 'not_found', message: 'Not found' } });
      return;
    }
    res.json(integration);
  });
  client.scenario.get(
    '/v1/integrations/integration/:integrationId/products/:productId/plans',
    (req, res) => {
      requests.push({ path: req.path, query: req.query });
      if (req.params.productId === 'iap_cloud_storage') {
        const { region } = JSON.parse(String(req.query.metadata));
        res.json({
          plans: region
            ? [plan({ id: `storage-${region}`, name: 'Storage' })]
            : [],
        });
        return;
      }
      const plans = plansByProductId[req.params.productId];
      if (plans === null) {
        res.json({});
        return;
      }
      if (!plans) {
        res
          .status(400)
          .json({ error: { code: 'bad_request', message: 'Partner error' } });
        return;
      }
      res.json({ plans });
    }
  );
  return { requests };
}

/** The JSON error document written to stderr. */
function stderrError() {
  const line = client.stderr
    .getFullOutput()
    .split('\n')
    .find(l => l.startsWith('{'));
  return JSON.parse(line ?? 'null');
}

describe('integration billing-plans', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    client.config.currentTeam = 'team_dummy';
  });

  describe('human output', () => {
    it('prints the plans of a single-product integration as a table on stdout', async () => {
      const { requests } = usePlans();
      client.setArgv('integration', 'billing-plans', 'neon');
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(0);

      const stdout = client.stdout.getFullOutput();
      expect(stdout).toMatch(/Plan ID\s+Name\s+Type\s+Price\s+Available/);
      expect(stdout).toMatch(/free_v3\s+Free\s+subscription\s+Free\s+Yes/);
      expect(stdout).toMatch(
        /launch\s+Launch\s+subscription\s+Paid \(\$19\/month\)\s+Yes/
      );
      expect(stdout).toMatch(/legacy\s+Legacy\s+subscription\s+Paid\s+No/);
      expect(stdout).not.toContain('Product');

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Billing plans for neon in');
      expect(stderr).toContain(
        'Install with a billing plan:\n    `vercel integration add neon --billing-plan <BILLING_PLAN>`'
      );

      expect(requests).toHaveLength(1);
      expect(requests[0].path).toBe(
        '/v1/integrations/integration/oac_neon/products/iap_neon/plans'
      );
      expect(requests[0].query).toMatchObject({
        metadata: '{}',
        teamId: 'team_dummy',
      });
    });

    it('prints tab-separated rows when stdout is not a terminal', async () => {
      usePlans();
      client.stdout.isTTY = false;
      client.setArgv('integration', 'billing-plans', 'neon');
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(0);

      expect(client.stdout.getFullOutput().split('\n')).toEqual([
        'Plan ID\tName\tType\tPrice\tAvailable',
        'free_v3\tFree\tsubscription\tFree\tYes',
        'launch\tLaunch\tsubscription\tPaid ($19/month)\tYes',
        'legacy\tLegacy\tsubscription\tPaid\tNo',
        '',
      ]);
    });

    it('adds a Product column for a multi-product integration', async () => {
      const { requests } = usePlans();
      client.stdout.isTTY = false;
      client.setArgv('integration', 'billing-plans', 'aws');
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(0);

      expect(client.stdout.getFullOutput().split('\n')).toEqual([
        'Product\tPlan ID\tName\tType\tPrice\tAvailable',
        'aws/aws-s3\ts3-plan\tS3\tsubscription\tPaid\tYes',
        'aws/aws-dynamodb\tdynamodb-plan\tDynamoDB\tprepayment\tPaid\tYes',
        '',
      ]);
      expect(client.stderr.getFullOutput()).toContain(
        'vercel integration add aws/<product> --billing-plan <BILLING_PLAN>'
      );
      expect(requests).toHaveLength(2);
    });

    it('keeps the global options in suggested commands', async () => {
      usePlans();
      client.setArgv(
        'integration',
        'billing-plans',
        'neon',
        '--scope',
        'team_dummy'
      );
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(0);
      expect(client.stderr.getFullOutput()).toContain(
        'vercel integration add neon --billing-plan <BILLING_PLAN> --scope team_dummy'
      );
    });

    it('says so when a product has no plans', async () => {
      usePlans();
      client.setArgv('integration', 'billing-plans', 'neon-empty');
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput('No billing plans for Neon Empty.');
      expect(client.stderr.getFullOutput()).not.toContain('Install with');
    });
  });

  describe('--json', () => {
    it.each([
      ['--json'],
      ['--format', 'json'],
    ])('prints the plans with %s', async (...flags) => {
      usePlans();
      client.setArgv('integration', 'billing-plans', 'neon', ...flags);
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(0);

      expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
        integration: { id: 'oac_neon', slug: 'neon', name: 'Neon' },
        products: [
          {
            id: 'iap_neon',
            slug: 'neon',
            name: 'Neon Postgres',
            argument: 'neon',
            plans: [
              { ...neonPlans[0], free: true, available: true },
              { ...neonPlans[1], free: false, available: true },
              { ...neonPlans[2], free: false, available: false },
            ],
          },
        ],
      });
      expect(client.stderr.getFullOutput()).toBe('');
    });

    it('lists every product of a multi-product integration', async () => {
      usePlans();
      client.setArgv('integration', 'billing-plans', 'aws', '--json');
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(
        payload.products.map(
          (p: { argument: string; plans: { id: string }[] }) => [
            p.argument,
            p.plans.map(plan => plan.id),
          ]
        )
      ).toEqual([
        ['aws/aws-s3', ['s3-plan']],
        ['aws/aws-dynamodb', ['dynamodb-plan']],
      ]);
    });

    it('lists only the product named with <integration>/<product>', async () => {
      const { requests } = usePlans();
      client.setArgv(
        'integration',
        'billing-plans',
        'aws/aws-dynamodb',
        '--json'
      );
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.products).toHaveLength(1);
      expect(payload.products[0]).toMatchObject({
        slug: 'aws-dynamodb',
        argument: 'aws/aws-dynamodb',
        plans: [{ id: 'dynamodb-plan', type: 'prepayment', free: false }],
      });
      expect(requests).toHaveLength(1);
      expect(requests[0].path).toContain('/products/iap_dynamodb/plans');
    });

    it("passes the API's plan fields through", async () => {
      usePlans();
      client.setArgv('integration', 'billing-plans', 'aws/aws-s3', '--json');
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(0);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.products[0].plans[0]).toEqual({
        id: 's3-plan',
        name: 'S3',
        type: 'subscription',
        scope: 'resource',
        description: '',
        paymentMethodRequired: true,
        cost: ' ',
        details: [{ label: 'Storage', value: '$0.023 per GB/month' }],
        free: false,
        available: true,
      });
    });

    it('treats a response without a plan list as no plans', async () => {
      usePlans();
      client.setArgv('integration', 'billing-plans', 'no-list', '--json');
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(0);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.products[0].plans).toEqual([]);
    });

    it('reports a product whose plans request failed next to the others, and exits 1', async () => {
      usePlans();
      client.setArgv('integration', 'billing-plans', 'mixed', '--json');
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(1);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.products).toMatchObject([
        { argument: 'mixed/mixed-ok' },
        {
          argument: 'mixed/mixed-down',
          plans: [],
          error: 'Partner error',
        },
      ]);
      expect(
        payload.products[0].plans.map((p: { id: string }) => p.id)
      ).toEqual(['free_v3', 'launch', 'legacy']);
      expect(payload.products[0]).not.toHaveProperty('error');
    });
  });

  it('shows the plans that came back when another product fails', async () => {
    usePlans();
    client.setArgv('integration', 'billing-plans', 'mixed');
    const exitCode = await integrationCommand(client);
    expect(exitCode).toEqual(1);
    expect(client.stdout.getFullOutput()).toMatch(/mixed\/mixed-ok\s+free_v3/);
    expect(client.stderr.getFullOutput()).toContain(
      "✗ Couldn't list the billing plans for Mixed Down (mixed/mixed-down).\n  Vercel API: Partner error"
    );
  });

  it('reports a product whose request never got a response next to the others', async () => {
    usePlans();
    const { fetchBillingPlans: actual } = await vi.importActual<
      typeof import('../../../../src/util/integration/fetch-billing-plans')
    >('../../../../src/util/integration/fetch-billing-plans');
    vi.mocked(fetchBillingPlans)
      .mockImplementationOnce(actual)
      .mockImplementationOnce(async () => {
        throw Object.assign(new Error('socket hang up'), {
          code: 'ECONNRESET',
        });
      });
    client.setArgv('integration', 'billing-plans', 'aws', '--json');
    const exitCode = await integrationCommand(client);
    expect(exitCode).toEqual(1);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.products).toMatchObject([
      { argument: 'aws/aws-s3', plans: [{ id: 's3-plan' }] },
      {
        argument: 'aws/aws-dynamodb',
        plans: [],
        error: "Couldn't reach the Vercel API. The connection failed.",
      },
    ]);
  });

  it('reports every product when all plans requests fail', async () => {
    usePlans();
    client.setArgv('integration', 'billing-plans', 'all-down');
    const exitCode = await integrationCommand(client);
    expect(exitCode).toEqual(1);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain("✗ Couldn't list the billing plans for all-down.");
    expect(stderr).toContain('all-down/down-a: Vercel API: Partner error');
    expect(stderr).toContain('all-down/down-b: Vercel API: Partner error');
    expect(client.stdout.getFullOutput()).toBe('');
  });

  describe('--meta', () => {
    it('keeps the --meta in the suggested install command', async () => {
      usePlans();
      client.setArgv(
        'integration',
        'billing-plans',
        'cloud',
        '--meta',
        'region=sfo1'
      );
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(0);
      expect(client.stderr.getFullOutput()).toContain(
        'vercel integration add cloud --billing-plan <BILLING_PLAN> --meta region=sfo1'
      );
    });

    it('keeps the passed --meta in the metadata retry', async () => {
      usePlans();
      client.setArgv(
        'integration',
        'billing-plans',
        'cloud',
        '--meta',
        'org=acme'
      );
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(0);
      expect(client.stderr.getFullOutput()).toContain(
        'vercel integration billing-plans cloud --meta org=acme --meta region=<VALUE>'
      );
    });

    it('sends the product metadata with the plans request', async () => {
      const { requests } = usePlans();
      client.setArgv(
        'integration',
        'billing-plans',
        'cloud',
        '--meta',
        'region=sfo1',
        '--meta',
        'org=acme',
        '--json'
      );
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(0);

      // `org` is installation metadata, which the plans request does not take.
      expect(JSON.parse(String(requests[0].query.metadata))).toEqual({
        region: 'sfo1',
      });
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.products[0].plans).toMatchObject([{ id: 'storage-sfo1' }]);
      expect(payload.products[0]).not.toHaveProperty('next');
    });

    it('suggests the missing required metadata when no plans come back', async () => {
      usePlans();
      client.setArgv('integration', 'billing-plans', 'cloud');
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(0);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('No billing plans for Cloud Storage.');
      // Not the hidden key, the one with a default, or the undeclared one.
      expect(stderr).toContain(
        'Pass the product metadata the integration may need to list plans:\n    `vercel integration billing-plans cloud --meta region=<VALUE>`'
      );
    });

    it('puts the metadata retry in the JSON output', async () => {
      usePlans();
      client.setArgv('integration', 'billing-plans', 'cloud', '--json');
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.products[0]).toMatchObject({
        plans: [],
        next: [
          {
            command:
              'vercel integration billing-plans cloud --meta region=<VALUE>',
          },
        ],
      });
    });

    it('rejects invalid metadata before requesting plans', async () => {
      const { requests } = usePlans();
      client.setArgv(
        'integration',
        'billing-plans',
        'cloud',
        '--meta',
        'region=mars'
      );
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(2);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('✗ Invalid --meta.');
      expect(stderr).toContain('Metadata "region" must be one of: iad1, sfo1');
      expect(stderr).toContain('vercel integration add cloud --help');
      expect(requests).toHaveLength(0);
    });

    it('reports invalid metadata as issues in JSON', async () => {
      usePlans();
      client.setArgv(
        'integration',
        'billing-plans',
        'cloud',
        '--meta',
        'region=mars',
        '--json'
      );
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(2);
      expect(stderrError()).toMatchObject({
        reason: 'invalid_arguments',
        message: 'Invalid --meta.',
        data: {
          issues: [
            {
              field: 'meta',
              reason: 'invalid_arguments',
              message: 'Metadata "region" must be one of: iad1, sfo1',
            },
          ],
        },
      });
    });

    it('needs a single product', async () => {
      usePlans();
      client.setArgv(
        'integration',
        'billing-plans',
        'aws',
        '--meta',
        'region=iad1'
      );
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(2);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('✗ --meta needs one product. aws has 2.');
      expect(stderr).toContain('Products: aws/aws-s3, aws/aws-dynamodb');
    });

    it('tracks telemetry without the value', async () => {
      usePlans();
      client.setArgv(
        'integration',
        'billing-plans',
        'cloud',
        '--meta',
        'region=iad1'
      );
      await integrationCommand(client);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:billing-plans', value: 'billing-plans' },
        { key: 'option:meta', value: '[REDACTED]' },
        { key: 'argument:integration', value: 'cloud' },
      ]);
    });
  });

  it('tracks telemetry', async () => {
    usePlans();
    client.setArgv('integration', 'billing-plans', 'neon', '--json');
    await integrationCommand(client);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:billing-plans', value: 'billing-plans' },
      { key: 'flag:json', value: 'TRUE' },
      { key: 'argument:integration', value: 'neon' },
    ]);
  });

  describe('errors', () => {
    it('requires an integration', async () => {
      client.setArgv('integration', 'billing-plans');
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(2);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        '✗ Missing the integration to list billing plans for.'
      );
      expect(stderr).toContain('vercel integration discover');
    });

    it('writes a JSON error document to stderr when non-interactive', async () => {
      client.nonInteractive = true;
      client.setArgv('integration', 'billing-plans', '--non-interactive');
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(2);
      expect(client.stdout.getFullOutput()).toBe('');
      const payload = stderrError();
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'missing_arguments',
      });
      expect(payload.next?.[1]?.command).toBe(
        'vercel integration discover --non-interactive'
      );
    });

    it('writes a JSON error document for an unknown option with --json', async () => {
      client.setArgv(
        'integration',
        'billing-plans',
        'neon',
        '--json',
        '--not-an-option'
      );
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(2);
      expect(client.stdout.getFullOutput()).toBe('');
      expect(stderrError()).toMatchObject({
        status: 'error',
        reason: 'invalid_arguments',
      });
    });

    it('rejects more than one integration', async () => {
      client.setArgv('integration', 'billing-plans', 'neon', 'aws');
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput('✗ Pass one integration at a time.');
    });

    it.each([
      'aws/',
      '/aws',
      'aws/s3/extra',
      'neon?teamId=team_other',
    ])('rejects the malformed argument %s before any request', async arg => {
      const { requests } = usePlans();
      client.setArgv('integration', 'billing-plans', arg);
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput(`✗ Invalid integration ${arg}.`);
      expect(requests).toHaveLength(0);
    });

    it('reports an unknown integration without sending its slug', async () => {
      usePlans();
      client.setArgv('integration', 'billing-plans', 'does-not-exist');
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        "✗ Couldn't find integration does-not-exist."
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:billing-plans', value: 'billing-plans' },
        { key: 'argument:integration', value: '[REDACTED]' },
      ]);
    });

    it('reports an integration that is not on the Marketplace', async () => {
      usePlans();
      client.setArgv('integration', 'billing-plans', 'external', '--json');
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(1);
      expect(client.stdout.getFullOutput()).toBe('');
      expect(stderrError()).toMatchObject({
        reason: 'not_found',
        message:
          "external isn't a Marketplace integration, so it has no billing plans.",
      });
    });

    it('lists the valid products for an unknown product', async () => {
      usePlans();
      client.setArgv('integration', 'billing-plans', 'aws/nope', '--json');
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(1);
      expect(stderrError()).toMatchObject({
        reason: 'not_found',
        message: "Couldn't find product nope in aws.",
        data: { products: ['aws/aws-s3', 'aws/aws-dynamodb'] },
        next: [{ command: 'vercel integration billing-plans aws' }],
      });
    });

    it('reports a failed plans request with the API message as detail', async () => {
      usePlans();
      client.setArgv('integration', 'billing-plans', 'partner-down', '--json');
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(1);
      expect(client.stdout.getFullOutput()).toBe('');
      expect(stderrError()).toMatchObject({
        reason: 'api_error',
        message: "Couldn't list the billing plans for partner-down.",
        data: {
          products: [{ argument: 'partner-down', error: 'Partner error' }],
        },
      });
    });
  });
});
