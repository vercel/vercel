import { client } from './client';
import type { Flag, SdkKey, FlagSettings } from '../../src/util/flags/types';

export const defaultFlagSettings: FlagSettings = {
  typeName: 'settings',
  projectId: 'vercel-flags-test',
  enabled: true,
  environments: ['production', 'preview', 'development'],
  entities: [
    {
      kind: 'user',
      label: 'User',
      attributes: [
        {
          key: 'plan',
          type: 'string',
          labels: [
            { value: 'pro', label: 'Pro Plan' },
            { value: 'enterprise', label: 'Enterprise Plan' },
          ],
        },
        {
          key: 'userId',
          type: 'string',
        },
      ],
    },
  ],
};

export const defaultFlags: Flag[] = [
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
        rules: [
          {
            id: 'rule_1',
            conditions: [
              {
                lhs: { type: 'entity', kind: 'user', attribute: 'plan' },
                cmp: 'eq',
                rhs: 'pro',
              },
            ],
            outcome: { type: 'variant', variantId: 'on' },
          },
          {
            id: 'rule_2',
            conditions: [
              {
                lhs: { type: 'entity', kind: 'user', attribute: 'userId' },
                cmp: 'in',
                rhs: {
                  type: 'list',
                  items: [{ value: 'user_001' }, { value: 'user_002' }],
                },
              },
            ],
            outcome: { type: 'variant', variantId: 'on' },
          },
        ],
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
  {
    id: 'flag_def456',
    slug: 'another-feature',
    description: 'Another feature flag',
    kind: 'string',
    state: 'active',
    variants: [
      { id: 'default', value: 'control', label: 'Control' },
      { id: 'variant-a', value: 'variant-a', label: 'Variant A' },
    ],
    environments: {
      production: {
        active: true,
        fallthrough: { type: 'variant', variantId: 'default' },
        pausedOutcome: { type: 'variant', variantId: 'default' },
        rules: [],
      },
      preview: {
        active: true,
        fallthrough: { type: 'variant', variantId: 'default' },
        pausedOutcome: { type: 'variant', variantId: 'default' },
        rules: [],
      },
      development: {
        active: true,
        fallthrough: { type: 'variant', variantId: 'default' },
        pausedOutcome: { type: 'variant', variantId: 'default' },
        rules: [],
      },
    },
    createdAt: Date.now() - 172800000,
    updatedAt: Date.now() - 7200000,
    createdBy: 'user_123',
    projectId: 'vercel-flags-test',
    ownerId: 'team_dummy',
    revision: 2,
    seed: 67890,
    typeName: 'flag',
  },
];

export const defaultSdkKeys: SdkKey[] = [
  {
    hashKey: 'sdk_key_abc123',
    projectId: 'vercel-flags-test',
    type: 'server',
    environment: 'production',
    createdBy: 'user_123',
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
    label: 'Production Server',
  },
  {
    hashKey: 'sdk_key_def456',
    projectId: 'vercel-flags-test',
    type: 'client',
    environment: 'preview',
    createdBy: 'user_123',
    createdAt: Date.now() - 172800000,
    updatedAt: Date.now() - 172800000,
  },
];

export function useFlags(
  flagsList: Flag[] = defaultFlags,
  sdkKeysList: SdkKey[] = defaultSdkKeys,
  settings: FlagSettings = defaultFlagSettings
) {
  // Get flag settings
  client.scenario.get(
    '/v1/projects/:projectId/feature-flags/settings',
    (_req, res) => {
      res.json(settings);
    }
  );

  // List flags
  client.scenario.get(
    '/v1/projects/:projectId/feature-flags/flags',
    (req, res) => {
      const state = req.query.state || 'active';
      const filteredFlags = flagsList.filter(f => f.state === state);
      res.json({ data: filteredFlags });
    }
  );

  // Get single flag
  client.scenario.get(
    '/v1/projects/:projectId/feature-flags/flags/:flagIdOrSlug',
    (req, res) => {
      const { flagIdOrSlug } = req.params;
      const flag = flagsList.find(
        f => f.id === flagIdOrSlug || f.slug === flagIdOrSlug
      );
      if (flag) {
        res.json(flag);
      } else {
        res.status(404).json({ error: { message: 'Flag not found' } });
      }
    }
  );

  // Create flag
  client.scenario.put(
    '/v1/projects/:projectId/feature-flags/flags',
    (req, res) => {
      const newFlag: Flag = {
        id: `flag_${Date.now()}`,
        slug: req.body.slug,
        description: req.body.description,
        kind: req.body.kind || 'boolean',
        state: 'active',
        variants: req.body.variants || [
          { id: 'off', value: false, label: 'Off' },
          { id: 'on', value: true, label: 'On' },
        ],
        environments: req.body.environments,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: 'user_123',
        projectId: req.params.projectId,
        ownerId: 'team_dummy',
        revision: 1,
        seed: Math.floor(Math.random() * 100000),
        typeName: 'flag',
      };
      flagsList.push(newFlag);
      res.status(201).json(newFlag);
    }
  );

  // Update flag
  client.scenario.patch(
    '/v1/projects/:projectId/feature-flags/flags/:flagIdOrSlug',
    (req, res) => {
      const { flagIdOrSlug } = req.params;
      const flagIndex = flagsList.findIndex(
        f => f.id === flagIdOrSlug || f.slug === flagIdOrSlug
      );
      if (flagIndex !== -1) {
        const flag = flagsList[flagIndex];
        const updatedFlag = {
          ...flag,
          ...req.body,
          updatedAt: Date.now(),
          revision: flag.revision + 1,
        };
        // Merge environments if provided
        if (req.body.environments) {
          updatedFlag.environments = {
            ...flag.environments,
            ...req.body.environments,
          };
          // Merge individual environment configs
          for (const [env, config] of Object.entries(req.body.environments)) {
            if (flag.environments[env]) {
              updatedFlag.environments[env] = {
                ...flag.environments[env],
                ...(config as object),
              };
            }
          }
        }
        flagsList[flagIndex] = updatedFlag;
        res.json(updatedFlag);
      } else {
        res.status(404).json({ error: { message: 'Flag not found' } });
      }
    }
  );

  // Delete flag
  client.scenario.delete(
    '/v1/projects/:projectId/feature-flags/flags/:flagIdOrSlug',
    (req, res) => {
      const { flagIdOrSlug } = req.params;
      const flagIndex = flagsList.findIndex(
        f => f.id === flagIdOrSlug || f.slug === flagIdOrSlug
      );
      if (flagIndex !== -1) {
        flagsList.splice(flagIndex, 1);
        res.status(204).send();
      } else {
        res.status(404).json({ error: { message: 'Flag not found' } });
      }
    }
  );

  // List SDK keys
  client.scenario.get(
    '/v1/projects/:projectId/feature-flags/sdk-keys',
    (_req, res) => {
      res.json({ data: sdkKeysList });
    }
  );

  // Create SDK key
  client.scenario.put(
    '/v1/projects/:projectId/feature-flags/sdk-keys',
    (req, res) => {
      const newKey: SdkKey = {
        hashKey: `sdk_key_${Date.now()}`,
        projectId: req.params.projectId,
        type: req.body.sdkKeyType,
        environment: req.body.environment,
        createdBy: 'user_123',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        label: req.body.label,
        keyValue: `vercel_flags_${Date.now()}_secret`,
        connectionString: `https://flags.vercel.com/v1/flags/${req.params.projectId}`,
      };
      sdkKeysList.push(newKey);
      res.json(newKey);
    }
  );

  // Delete SDK key
  client.scenario.delete(
    '/v1/projects/:projectId/feature-flags/sdk-keys/:hashKey',
    (req, res) => {
      const { hashKey } = req.params;
      const keyIndex = sdkKeysList.findIndex(k => k.hashKey === hashKey);
      if (keyIndex !== -1) {
        sdkKeysList.splice(keyIndex, 1);
        res.status(204).send();
      } else {
        res.status(404).json({ error: { message: 'SDK key not found' } });
      }
    }
  );

  return { flags: flagsList, sdkKeys: sdkKeysList };
}
