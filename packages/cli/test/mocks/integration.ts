import type {
  Configuration,
  InstallationBalancesAndThresholds,
  Integration,
  MarketplaceBillingAuthorizationState,
  MetadataSchema,
} from '../../src/util/integration/types';
import type { Resource } from '../../src/util/integration-resource/types';
import { client } from './client';

const metadataSchema1: MetadataSchema = {
  type: 'object',
  properties: {
    region: {
      'ui:control': 'select',
      'ui:label': 'Primary Region',
      default: 'us-east-1',
      description: 'Primary region where your database will be hosted',
      'ui:placeholder': 'Choose your region',
      type: 'string',
      'ui:hidden': 'update',
      'ui:options': [
        {
          value: 'us-west-1',
          label: 'West US (North California)',
        },
        {
          value: 'us-east-1',
          label: 'East US (North Virginia)',
        },
      ],
    },
  },
  required: ['region'],
};

const metadataSchema2: MetadataSchema = {
  type: 'object',
  properties: {
    version: {
      'ui:label': 'Version',
      'ui:control': 'select',
      description: 'Version to use',
      type: 'string',
      default: '5.6',
      'ui:options': [
        {
          value: '5.6',
          label: '5.6 (latest)',
        },
        {
          label: '5.4',
          value: '5.4',
        },
        {
          label: '5.2',
          value: '5.2',
        },
        {
          label: '4.5',
          value: '4.5',
        },
        {
          label: '4.2',
          value: '4.2',
        },
      ],
    },
    region: {
      'ui:label': 'Region',
      'ui:hidden': 'update',
      'ui:control': 'vercel-region',
      type: 'string',
      default: 'cle1',
      'ui:options': ['pdx1', 'cle1', 'dub1'],
    },
    compute: {
      'ui:label': 'Compute',
      description: '',
      'ui:control': 'select',
      'ui:hidden': true,
      type: 'string',
      'ui:options': [
        {
          value: '1/4',
          label: '1/4 compute unit',
          hidden: true,
        },
        {
          label: '1 compute unit (0.25vCPU, 2GiB RAM)',
          value: '1',
        },
        {
          label: '2 compute units (0.5vCPU, 4GiB RAM)',
          value: '2',
        },
        {
          label: '3 compute units (0.75vCPU, 6GiB RAM)',
          value: '3',
        },
        {
          label: '4 compute units (1vCPU, 8GiB RAM)',
          value: '4',
        },
        {
          label: '8 compute units (2vCPU, 16GiB RAM)',
          value: '8',
        },
        {
          label: '12 compute units (3vCPU, 24GiB RAM)',
          value: '12',
        },
      ],
    },
    storage: {
      type: 'number',
      'ui:control': 'input',
      'ui:hidden': true,
      'ui:label': 'Storage',
      description: 'Disk space in GiB',
      minimum: 1,
      maximum: 256,
    },
  },
  required: ['version', 'region'],
};

const metadataSchema3: MetadataSchema = {
  type: 'object',
  properties: {
    Region: {
      'ui:label': 'Region',
      description: '',
      default: 'us-east-1',
      'ui:read-only': true,
      'ui:control': 'vercel-region',
      type: 'string',
      'ui:options': [
        {
          value: 'us-east-1',
          label: 'US East (N. Virginia) us-east-1',
        },
      ],
    },
  },
  required: ['Region'],
};

const metadataUnsupported: MetadataSchema = {
  type: 'object',
  properties: {
    region: {
      'ui:control': 'select',
      'ui:label': 'Primary Region',
      default: 'us-east-1',
      description: 'Primary region where your database will be hosted',
      'ui:placeholder': 'Choose your region',
      type: 'string',
      'ui:options': [
        {
          value: 'us-west-1',
          label: 'West US (North California)',
        },
        {
          value: 'us-east-1',
          label: 'East US (North Virginia)',
        },
      ],
    },
    storage: {
      type: 'number',
      'ui:control': 'input',
      'ui:hidden': { expr: "Region == 'us-east-1" },
      'ui:label': 'Storage',
      description: 'Disk space in GiB',
      minimum: 1,
      maximum: 256,
    },
  },
  required: ['region'],
};

const integrations: Record<string, Integration> = {
  acme: {
    id: 'acme',
    name: 'Acme Integration',
    slug: 'acme',
    products: [
      {
        id: 'acme-product',
        name: 'Acme Product',
        slug: 'acme',
        type: 'storage',
        shortDescription: 'The Acme product',
        metadataSchema: metadataSchema1,
      },
    ],
  },
  'acme-two-products': {
    id: 'acme-two-products',
    name: 'Acme Integration Two Products',
    slug: 'acme-two-products',
    products: [
      {
        id: 'acme-product-a',
        name: 'Acme Product A',
        slug: 'acme-a',
        type: 'storage',
        shortDescription: 'The Acme A product',
        metadataSchema: metadataSchema2,
      },
      {
        id: 'acme-product-b',
        name: 'Acme Product B',
        slug: 'acme-b',
        type: 'storage',
        shortDescription: 'The Acme B product',
        metadataSchema: metadataSchema3,
      },
    ],
  },
  'acme-external': {
    id: 'acme-external',
    name: 'Acme Integration External',
    slug: 'acme-external',
  },
  'acme-no-products': {
    id: 'acme-no-products',
    name: 'Acme Integration No Products',
    slug: 'acme-no-products',
    products: [],
  },
  'acme-prepayment': {
    id: 'acme-prepayment',
    name: 'Acme Prepayment',
    slug: 'acme-prepayment',
    products: [
      {
        id: 'acme-product',
        name: 'Acme Product',
        slug: 'acme',
        type: 'ai',
        shortDescription: 'The Acme product',
        metadataSchema: metadataSchema1,
      },
    ],
  },
  'acme-unsupported': {
    id: 'acme',
    name: 'Acme Integration',
    slug: 'acme',
    products: [
      {
        id: 'acme-product',
        name: 'Acme Product',
        slug: 'acme',
        type: 'storage',
        shortDescription: 'The Acme product',
        metadataSchema: metadataUnsupported,
      },
    ],
  },
};

const configurations: Record<string, Configuration[]> = {
  acme: [
    {
      id: 'acme-1',
      integrationId: 'acme',
      ownerId: 'team_dummy',
      slug: 'acme',
      teamId: 'team_dummy',
      userId: 'user_dummy',
      scopes: ['read-write:integration-resource'],
      source: 'marketplace',
      installationType: 'marketplace',
      projects: ['acme-project'],
    },
  ],
  'acme-two-configurations': [
    {
      id: 'acme-first',
      integrationId: 'acme',
      ownerId: 'team_dummy',
      slug: 'acme-two-configurations',
      teamId: 'team_dummy',
      userId: 'user_dummy',
      scopes: ['read-write:integration-resource'],
      source: 'marketplace',
      installationType: 'marketplace',
      projects: ['acme-project'],
    },
    {
      id: 'acme-second',
      integrationId: 'acme',
      ownerId: 'team_dummy',
      slug: 'acme-two-configurations',
      teamId: 'team_dummy',
      userId: 'user_dummy',
      scopes: ['read-write:integration-resource'],
      source: 'marketplace',
      installationType: 'marketplace',
      projects: ['acme-project'],
    },
  ],
  'acme-two-projects': [
    {
      id: 'acme-first',
      integrationId: 'acme',
      ownerId: 'team_dummy',
      slug: 'acme-two-projects',
      teamId: 'team_dummy',
      userId: 'user_dummy',
      scopes: ['read-write:integration-resource'],
      source: 'marketplace',
      installationType: 'marketplace',
      projects: ['acme-1', 'acme-2'],
    },
  ],
  'acme-no-projects': [
    {
      id: 'acme-first',
      integrationId: 'acme',
      ownerId: 'team_dummy',
      slug: 'acme-no-projects',
      teamId: 'team_dummy',
      userId: 'user_dummy',
      scopes: ['read-write:integration-resource'],
      source: 'marketplace',
      installationType: 'marketplace',
      projects: [],
    },
  ],
  'acme-prepayment': [
    {
      id: 'acme-1',
      integrationId: 'acme-prepayment',
      ownerId: 'team_dummy',
      slug: 'acme-prepayment',
      teamId: 'team_dummy',
      userId: 'user_dummy',
      scopes: ['read-write:integration-resource'],
      source: 'marketplace',
      installationType: 'marketplace',
      projects: ['acme-project'],
    },
  ],
  'acme-no-results': [],
};

const integrationPlans: Record<string, unknown> = {
  acme: {
    plans: [
      {
        id: 'pro',
        type: 'subscription',
        name: 'Pro Plan',
        scope: 'installation',
        description:
          'Dedicated CPU • 1 GB RAM • 100K MAU • 8 GB database space • 250 GB bandwidth • 100 GB file storage',
        paymentMethodRequired: true,
        details: [
          {
            label: 'New Project - Micro Compute',
            value: '$10/m',
          },
          {
            label: 'Pro Plan',
            value: '$25/m',
          },
          {
            label: 'Compute Credits',
            value: '-$10/m',
          },
        ],
        highlightedDetails: [],
      },
      {
        id: 'team',
        type: 'subscription',
        name: 'Team Plan',
        scope: 'installation',
        description:
          'SOC2 • SSO for Supabase Dashboard • Priority email support & SLAs • 28-day log retention',
        paymentMethodRequired: true,
        details: [
          {
            label: 'New Project - Micro Compute',
            value: '$10/m',
          },
          {
            label: 'Team Plan',
            value: '$599/m',
          },
          {
            label: 'Compute Credits',
            value: '-$10/m',
          },
        ],
        highlightedDetails: [],
      },
      {
        id: 'free',
        type: 'subscription',
        name: 'Free Plan',
        scope: 'installation',
        description:
          'Unlimited API requests • Shared CPU • 500 MB RAM • 50K MAU • 500 MB database space • 5 GB bandwidth • 1 GB file storage',
        paymentMethodRequired: false,
        details: [],
        highlightedDetails: [
          {
            label:
              'Unavailable - The following members have reached their 2 project Free Plan limit: luka.hartwig@vercel.com. All active projects in Free Plan organizations count towards this limit.',
          },
        ],
        disabled: true,
      },
    ],
  },
  'acme-prepayment': {
    plans: [
      {
        id: 'pro',
        type: 'prepayment',
        name: 'Pro Plan',
        scope: 'installation',
        description:
          'Dedicated CPU • 1 GB RAM • 100K MAU • 8 GB database space • 250 GB bandwidth • 100 GB file storage',
        paymentMethodRequired: true,
        details: [
          {
            label: 'New Project - Micro Compute',
            value: '$10/m',
          },
          {
            label: 'Pro Plan',
            value: '$25/m',
          },
          {
            label: 'Compute Credits',
            value: '-$10/m',
          },
        ],
        highlightedDetails: [],
      },
      {
        id: 'team',
        type: 'prepayment',
        name: 'Team Plan',
        scope: 'installation',
        description:
          'SOC2 • SSO for Supabase Dashboard • Priority email support & SLAs • 28-day log retention',
        paymentMethodRequired: true,
        details: [
          {
            label: 'New Project - Micro Compute',
            value: '$10/m',
          },
          {
            label: 'Team Plan',
            value: '$599/m',
          },
          {
            label: 'Compute Credits',
            value: '-$10/m',
          },
        ],
        highlightedDetails: [],
      },
      {
        id: 'free',
        type: 'subscription',
        name: 'Free Plan',
        scope: 'installation',
        description:
          'Unlimited API requests • Shared CPU • 500 MB RAM • 50K MAU • 500 MB database space • 5 GB bandwidth • 1 GB file storage',
        paymentMethodRequired: false,
        details: [],
        highlightedDetails: [
          {
            label:
              'Unavailable - The following members have reached their 2 project Free Plan limit: luka.hartwig@vercel.com. All active projects in Free Plan organizations count towards this limit.',
          },
        ],
        disabled: true,
      },
    ],
  },
};

const configurationPrepaymentInformation: Record<
  string,
  InstallationBalancesAndThresholds
> = {
  'acme-prepayment': {
    installationId: 'acme-prepayment-installation',
    ownerId: 'team_dummy',
    balances: [
      {
        resourceId: 'store_1',
        timestamp: '2024-01-01T00:00:00Z',
        credit: '$15.00',
        nameLabel: '$',
        currencyValueInCents: 1500,
      },
    ],
    thresholds: [
      {
        resourceId: 'store_1',
        minimumAmountInCents: 1000,
        billingPlanId: 'pro',
        metadata: '{}',
        purchaseAmountInCents: 1000,
        maximumAmountPerPeriodInCents: 5000,
      },
    ],
  },
  'acme-no-balance': {
    installationId: 'acme-prepayment-installation',
    ownerId: 'team_dummy',
    balances: [],
    thresholds: [
      {
        resourceId: 'store_1',
        minimumAmountInCents: 1000,
        billingPlanId: 'pro',
        metadata: '{}',
        purchaseAmountInCents: 1000,
        maximumAmountPerPeriodInCents: 5000,
      },
    ],
  },
  'acme-no-threshold': {
    installationId: 'acme-prepayment-installation',
    ownerId: 'team_dummy',
    balances: [
      {
        resourceId: 'store_1',
        timestamp: '2024-01-01T00:00:00Z',
        credit: '$15.00',
        nameLabel: '$',
        currencyValueInCents: 1500,
      },
    ],
    thresholds: [],
  },
  'acme-multiple-balances-and-thresholds': {
    installationId: 'acme-prepayment-installation',
    ownerId: 'team_dummy',
    balances: [
      {
        resourceId: 'store_1',
        timestamp: '2024-01-01T00:00:00Z',
        credit: '$15.00',
        nameLabel: '$',
        currencyValueInCents: 1500,
      },
      {
        resourceId: 'store_2',
        timestamp: '2024-01-01T00:00:00Z',
        credit: '$12.00',
        nameLabel: '$',
        currencyValueInCents: 1200,
      },
    ],
    thresholds: [
      {
        resourceId: 'store_1',
        minimumAmountInCents: 1000,
        billingPlanId: 'pro',
        metadata: '{}',
        purchaseAmountInCents: 1000,
        maximumAmountPerPeriodInCents: 5000,
      },
      {
        resourceId: 'store_2',
        minimumAmountInCents: 500,
        billingPlanId: 'pro',
        metadata: '{}',
        purchaseAmountInCents: 2000,
        maximumAmountPerPeriodInCents: 50000,
      },
    ],
  },
  'acme-prepayment-installation-level': {
    installationId: 'acme-prepayment-installation',
    ownerId: 'team_dummy',
    balances: [
      {
        timestamp: '2024-01-01T00:00:00Z',
        credit: '$15.00',
        nameLabel: '$',
        currencyValueInCents: 1500,
      },
    ],
    thresholds: [
      {
        minimumAmountInCents: 1000,
        billingPlanId: 'pro',
        metadata: '{}',
        purchaseAmountInCents: 1000,
        maximumAmountPerPeriodInCents: 5000,
      },
    ],
  },
  'acme-prepayment-installation-level-no-threshold': {
    installationId: 'acme-prepayment-installation',
    ownerId: 'team_dummy',
    balances: [
      {
        timestamp: '2024-01-01T00:00:00Z',
        credit: '$15.00',
        nameLabel: '$',
        currencyValueInCents: 1500,
      },
    ],
    thresholds: [],
  },
  'acme-empty': {
    installationId: 'acme-prepayment-installation',
    ownerId: 'team_dummy',
    balances: [],
    thresholds: [],
  },
};

const resources: { stores: Resource[] } = {
  stores: [
    {
      id: 'store_not_marketplace',
      type: 'postgres',
      name: 'foobar',
      status: 'available',
      product: {},
      externalResourceId: 'ext_store_not_marketplace',
    },
    {
      id: 'store_1',
      type: 'integration',
      name: 'store-acme-connected-project',
      status: null,
      product: {
        name: 'Acme',
        slug: 'acme',
        integrationConfigurationId: 'acme-1',
      },
      projectsMetadata: [
        {
          id: 'spc_1',
          projectId: 'prj_connected',
          name: 'connected-project',
          environments: ['production', 'preview', 'development'],
        },
      ],
      externalResourceId: 'ext_store_1',
    },
    {
      id: 'store_2',
      type: 'integration',
      name: 'store-acme-other-project',
      status: 'available',
      product: { name: 'Acme', slug: 'acme' },
      projectsMetadata: [
        {
          id: 'spc_2',
          projectId: 'prj_otherProject',
          name: 'other-project',
          environments: ['production', 'preview', 'development'],
        },
      ],
      externalResourceId: 'ext_store_2',
    },
    {
      id: 'store_3',
      type: 'integration',
      name: 'store-foo-bar-both-projects',
      status: 'initializing',
      product: { name: 'Foo Bar', slug: 'foo-bar' },
      projectsMetadata: [
        {
          id: 'spc_3',
          projectId: 'prj_connected',
          name: 'connected-project',
          environments: ['production', 'preview', 'development'],
        },
        {
          id: 'spc_4',
          projectId: 'prj_otherProject',
          name: 'other-project',
          environments: ['production', 'preview', 'development'],
        },
      ],
      externalResourceId: 'ext_store_3',
    },
    {
      id: 'store_4',
      type: 'integration',
      name: 'store-acme-no-projects',
      status: 'available',
      product: { name: 'Acme', slug: 'acme' },
      projectsMetadata: [],
      externalResourceId: 'ext_store_4',
    },
    {
      id: 'rs_prepayment',
      type: 'integration',
      name: 'store-acme-prepayment',
      status: 'available',
      product: {
        name: 'Acme Prepayment',
        slug: 'acme-prepayment',
        integrationConfigurationId: 'acme-prepayment',
      },
      projectsMetadata: [],
      externalResourceId: 'store_1',
      billingPlan: {
        id: 'bp1',
        type: 'prepayment',
        name: 'Acme Prepayment Plan',
        scope: 'resource',
        description: 'Acme Prepayment Plan',
        paymentMethodRequired: true,
        details: [],
        minimumAmount: '5',
        maximumAmount: '10000',
      },
    },
    {
      id: 'rs_prepayment_installation',
      type: 'integration',
      name: 'store-acme-prepayment-installation',
      status: 'available',
      product: {
        name: 'Acme Prepayment',
        slug: 'acme-prepayment',
        integrationConfigurationId: 'acme-prepayment',
      },
      projectsMetadata: [],
      externalResourceId: 'store_1',
      billingPlan: {
        id: 'bp1',
        type: 'prepayment',
        name: 'Acme Prepayment Plan',
        scope: 'installation',
        description: 'Acme Prepayment Plan',
        paymentMethodRequired: true,
        details: [],
        minimumAmount: '5',
        maximumAmount: '10000',
      },
    },
    {
      id: 'rs_prepayment_min_max_50',
      type: 'integration',
      name: 'store-acme-prepayment_min_max_50',
      status: 'available',
      product: {
        name: 'Acme Prepayment',
        slug: 'acme-prepayment',
        integrationConfigurationId: 'acme-prepayment',
      },
      projectsMetadata: [],
      externalResourceId: 'store_1',
      billingPlan: {
        id: 'bp1',
        type: 'prepayment',
        name: 'Acme Prepayment Plan',
        scope: 'resource',
        description: 'Acme Prepayment Plan',
        paymentMethodRequired: true,
        details: [],
        minimumAmount: '50',
        maximumAmount: '50',
      },
    },
  ],
};

const authorizations: Record<string, MarketplaceBillingAuthorizationState> = {
  'success-case': {
    id: 'success-case',
    ownerId: 'team_dummy',
    integrationId: 'acme',
    status: 'succeeded',
    amountCent: 100,
    createdAt: 1,
    updatedAt: 1,
  },
  'failure-case': {
    id: 'failure-case',
    ownerId: 'team_dummy',
    integrationId: 'acme',
    status: 'failed',
    amountCent: 100,
    createdAt: 1,
    updatedAt: 1,
  },
};

export function useResources(returnError?: number) {
  client.scenario.get('/:version/storage/stores', (req, res) => {
    if (returnError) {
      res.status(returnError);
      res.end();
      return;
    }

    const { teamId } = req.query;

    if (!teamId) {
      res.status(500);
      res.end();
      return;
    }

    res.json(resources);
  });
}

export function useConfiguration() {
  client.scenario.get('/:version/integrations/configurations', (req, res) => {
    const { integrationIdOrSlug } = req.query;

    if (integrationIdOrSlug === 'error') {
      res.status(500);
      res.end();
      return;
    }

    const foundConfigs =
      configurations[(integrationIdOrSlug ?? 'acme-no-results') as string];

    res.json(foundConfigs);
  });
}

export function usePrepayment(responseKey: string) {
  client.scenario.get(
    '/v1/integrations/installations/:installationId/billing/balance',
    (req, res) => {
      if (responseKey === 'error') {
        res.status(500);
        res.end();
        return;
      }

      const prepaymentInfo = configurationPrepaymentInformation[responseKey];

      if (!prepaymentInfo) {
        res.status(404);
        res.end();
        return;
      }

      res.json(prepaymentInfo);
    }
  );
}

export function usePreauthorization(opts?: {
  id?: MarketplaceBillingAuthorizationState['id'];
  initialStatus?: MarketplaceBillingAuthorizationState['status'];
}) {
  client.scenario.post('/v1/integrations/billing/authorization', (req, res) => {
    const authorization = authorizations[opts?.id ?? 'success-case'];
    res.json({
      authorization: {
        ...authorization,
        status: opts?.initialStatus ?? authorization.status,
      },
    });
    res.end();
  });

  client.scenario.get(
    '/v1/integrations/billing/authorization/:authorizationId',
    (req, res) => {
      const { authorizationId } = req.params;
      const authorization = authorizations[authorizationId ?? 'success-case'];
      res.json(authorization);
      res.end();
    }
  );
}

export function useIntegration({
  withInstallation,
  ownerId,
}: {
  withInstallation: boolean;
  ownerId?: string;
}) {
  const storeId = 'store_123';

  client.scenario.get(
    '/:version/integrations/integration/:slug',
    (req, res) => {
      const { slug } = req.params;
      const integration = integrations[slug];

      if (!integration) {
        res.status(404);
        res.end();
        return;
      }

      res.json(integration);
    }
  );

  client.scenario.get('/:version/integrations/configurations', (req, res) => {
    const { installationType, integrationIdOrSlug } = req.query;

    if (installationType !== 'marketplace') {
      res.status(500);
      res.end();
      return;
    }

    res.json(
      withInstallation
        ? [
            {
              id: `${integrationIdOrSlug}-install`,
              installationType: 'marketplace',
              ownerId,
            },
          ]
        : []
    );
  });

  client.scenario.get(
    '/:version/integrations/integration/:integrationIdOrSlug/products/:productIdOrSlug/plans',
    (req, res) => {
      const { integrationIdOrSlug } = req.params;
      const plans = integrationPlans[integrationIdOrSlug];

      if (!plans) {
        res.status(404);
        res.end();
        return;
      }

      res.json(plans);
    }
  );

  client.scenario.post('/:version/storage/stores/integration', (_req, res) => {
    res.json({
      store: {
        id: storeId,
      },
    });
  });

  client.scenario.post(
    '/v1/storage/stores/:storeId/connections',
    (req, res) => {
      if (req.params.storeId !== storeId) {
        res.status(404);
        res.end();
        return;
      }

      res.status(200);
      res.end();
    }
  );
}
