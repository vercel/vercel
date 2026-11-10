import { beforeEach, describe, expect, it } from 'vitest';
import integrationCommand from '../../../../src/commands/integration';
import { client } from '../../../mocks/client';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

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
        metadataSchema: emptySchema,
      },
      {
        id: 'iap_dynamodb',
        slug: 'aws-dynamodb',
        name: 'Amazon DynamoDB',
        metadataSchema: emptySchema,
      },
    ],
  },
};

/** An installed integration whose auto-provision fails with `error`. */
function useFailingAutoProvision(error: {
  code: string;
  message: string;
  meta?: unknown;
}) {
  client.scenario.get('/v2/integrations/integration/:slug', (req, res) => {
    res.json(integrations[req.params.slug]);
  });
  client.scenario.get('/:version/integrations/configurations', (req, res) => {
    res.json([
      {
        id: 'icfg_installed',
        integrationId: req.query.integrationIdOrSlug,
        installationType: 'marketplace',
        ownerId: 'team_dummy',
      },
    ]);
  });
  client.scenario.post(
    '/v1/integrations/integration/:integrationSlug/marketplace/auto-provision/:productSlug',
    (_req, res) => {
      res.status(400).json({ error });
    }
  );
}

describe('integration add billing plan errors', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    client.config.currentTeam = 'team_dummy';
  });

  it.each([
    {
      code: 'bad_request',
      message:
        'Billing plan not found: free. Available plans: free_v3 (Free), launch (Launch)',
    },
    { code: 'bad_request', message: 'Billing plan is disabled: legacy' },
    {
      code: 'billing_plan_required',
      message:
        'Organization child teams must specify an explicit billingPlanId; automatic free-plan selection is not available for them.',
    },
  ])('points at `integration billing-plans` after "$message"', async error => {
    useFailingAutoProvision(error);
    client.setArgv('integration', 'add', 'neon', '--billing-plan', 'free');
    const exitCode = await integrationCommand(client);
    expect(exitCode).toEqual(1);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(`Error: ${error.message} (400)`);
    expect(stderr).toContain(
      'Run `vercel integration billing-plans neon` to list the billing plans available to this team, then pass a plan ID with --billing-plan.'
    );
  });

  it('names the product for a multi-product integration', async () => {
    useFailingAutoProvision({
      code: 'bad_request',
      message: 'Billing plan not found: free. Available plans: s3-plan (S3)',
    });
    client.setArgv(
      'integration',
      'add',
      'aws/aws-s3',
      '--billing-plan',
      'free'
    );
    const exitCode = await integrationCommand(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Run `vercel integration billing-plans aws/aws-s3` to list the billing plans'
    );
  });

  it('recognizes a plan error by its plan list', async () => {
    useFailingAutoProvision({
      code: 'bad_request',
      message: 'Plan unavailable',
      meta: { plans: [{ id: 'free_v3', name: 'Free', free: true }] },
    });
    client.setArgv('integration', 'add', 'neon', '--billing-plan', 'free');
    const exitCode = await integrationCommand(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Run `vercel integration billing-plans neon` to list the billing plans'
    );
  });

  it('keeps the team in the suggested command', async () => {
    useFailingAutoProvision({
      code: 'bad_request',
      message: 'Billing plan not found: free. Available plans: free_v3 (Free)',
    });
    client.setArgv(
      'integration',
      'add',
      'neon',
      '--billing-plan',
      'free',
      '--scope',
      'team_dummy'
    );
    const exitCode = await integrationCommand(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Run `vercel integration billing-plans neon --scope team_dummy` to list'
    );
  });

  it('does not suggest `integration billing-plans` for other errors', async () => {
    useFailingAutoProvision({
      code: 'bad_request',
      message: 'Resource name already exists',
    });
    client.setArgv('integration', 'add', 'neon', '--billing-plan', 'free');
    const exitCode = await integrationCommand(client);
    expect(exitCode).toEqual(1);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Error: Resource name already exists (400)');
    expect(stderr).not.toContain('billing-plans');
  });
});
