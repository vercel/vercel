import type { MockClient } from './client';

/**
 * `GET /v1/connect/services/:service?schemas=true` fixtures.
 *
 * Shaped after the vended `ConnexServiceInfo` in api-connex
 * (`packages/connex/src/client-types/service-info-types.ts`) as of the
 * connection-method create contract: every method carries its own full merged
 * `type` object plus the API-derived `create: { managed?, manual }`, so a
 * consumer never joins into `types[]`.
 *
 * The registry data mirrors `known-services/{notion,okta,npm}.ts` and the
 * slack/snowflake entries in `known-services.ts`. Only the fields the CLI
 * reads are guaranteed faithful; the rest is representative.
 */

/** Trimmed `OAuthClientCreateDataJsonSchema` — the keys the CLI reasons about. */
const OAUTH_CREATE_INPUT_SCHEMA = {
  type: 'object',
  title: 'type:oauth',
  required: ['clientId'],
  additionalProperties: false,
  properties: {
    serverUrl: { type: 'string' },
    serverConfig: { type: 'object' },
    clientId: { type: 'string' },
    clientName: { type: 'string' },
    clientSecret: { type: 'string' },
    tokenEndpointAuthMethod: { type: 'string' },
    pkceRequired: { type: 'boolean' },
  },
} as const;

const API_KEY_CREATE_INPUT_SCHEMA = {
  type: 'object',
  title: 'type:api-key',
  required: ['values'],
  additionalProperties: false,
  properties: {
    values: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['value'],
        additionalProperties: false,
        properties: {
          value: { type: 'string', minLength: 1 },
          scope: { type: 'string', minLength: 1 },
          expiresAt: { type: 'integer', exclusiveMinimum: 0 },
        },
      },
    },
  },
} as const;

function oauthType(overrides: Record<string, unknown> = {}) {
  return {
    type: 'oauth',
    name: 'OAuth',
    supportsIcon: false,
    supportsTriggers: false,
    supportsInstallation: true,
    supportsRevocation: true,
    supportsManagedCreation: false,
    createInputSchema: OAUTH_CREATE_INPUT_SCHEMA,
    encryptedFields: ['clientSecret', 'registrationAccessToken'],
    supportedSubjectTypes: ['user', 'app'],
    data: {},
    ...overrides,
  };
}

function apiKeyType(overrides: Record<string, unknown> = {}) {
  return {
    type: 'api-key',
    name: 'API Key',
    supportsIcon: false,
    supportsTriggers: false,
    supportsInstallation: false,
    supportsRevocation: false,
    supportsManagedCreation: false,
    createInputSchema: API_KEY_CREATE_INPUT_SCHEMA,
    encryptedFields: ['value'],
    supportedSubjectTypes: ['app'],
    data: {},
    ...overrides,
  };
}

/**
 * Two targets, three methods, both create paths represented. `mcp` resolves
 * `create.managed: true` from eager discovery (PR #82246), which is why its
 * `type.data` carries a discovery document and the other methods' don't.
 */
export const notionServiceInfo = {
  service: 'notion',
  name: 'Notion',
  website: 'https://www.notion.so',
  devsite: 'https://www.notion.so/my-integrations',
  docsite: 'https://developers.notion.com',
  supportsTriggers: false,
  supportsManagedCreation: true,
  supportsIcon: false,
  encryptedFields: ['clientSecret', 'registrationAccessToken', 'value'],
  supportedSubjectTypes: ['user', 'app'],
  targets: [
    {
      target: 'api',
      label: 'Notion API',
      description:
        "Connect your application directly to Notion's API to access and manage pages, databases, and comments. Best for custom integrations and fine-grained control.",
      docsUrl: 'https://developers.notion.com/reference/intro',
    },
    {
      target: 'mcp',
      label: 'Notion MCP',
      description:
        'Connect AI agents and assistants to Notion using ready-made tools to search, read, create, and update workspace content. Best for agentic workflows.',
      docsUrl: 'https://developers.notion.com/docs/mcp',
    },
  ],
  connectionMethods: [
    {
      connectionMethod: 'oauth',
      type: oauthType({
        createInputDefaults: {
          serverConfig: {
            authorization_endpoint:
              'https://api.notion.com/v1/oauth/authorize?owner=user',
            token_endpoint: 'https://api.notion.com/v1/oauth/token',
            token_endpoint_auth_methods_supported: ['client_secret_basic'],
          },
        },
      }),
      targets: ['api'],
      label: 'OAuth 2.0',
      docUrl: 'https://developers.notion.com/docs/authorization',
      settingsUrl: 'https://www.notion.so/my-integrations',
      instructions:
        "Create a **public** integration — internal integrations can't use OAuth.",
      create: { managed: false, manual: true },
    },
    {
      connectionMethod: 'mcp',
      type: oauthType({
        supportsManagedCreation: true,
        createInputDefaults: {
          serverUrl: 'https://mcp.notion.com/mcp',
          serverConfig: {
            issuer: 'https://mcp.notion.com',
            authorization_endpoint: 'https://mcp.notion.com/authorize',
            token_endpoint: 'https://mcp.notion.com/token',
            registration_endpoint: 'https://mcp.notion.com/register',
          },
        },
        data: {
          discoveryServerUrl: 'https://mcp.notion.com/mcp',
        },
      }),
      targets: ['mcp'],
      label: 'MCP',
      serviceUrls: ['https://mcp.notion.com/mcp', 'https://mcp.notion.com/sse'],
      create: { managed: true, manual: true },
    },
    {
      connectionMethod: 'api-key',
      type: apiKeyType(),
      targets: ['api'],
      label: 'API key',
      serviceUrls: ['https://api.notion.com'],
      instructions:
        'Create an integration token at [app.notion.com/developers/tokens](https://app.notion.com/developers/tokens) and paste it below. Then share the pages or databases you want the integration to access with it from within Notion.',
      create: { managed: false, manual: true },
    },
  ],
  types: [oauthType(), apiKeyType()],
};

const OKTA_DOC_URL =
  'https://developer.okta.com/docs/guides/implement-oauth-for-okta/main/';

/** Two template methods sharing one driver — `templateFields` + `--param`. */
export const oktaServiceInfo = {
  service: 'okta',
  name: 'Okta',
  website: 'https://www.okta.com',
  devsite: 'https://developer.okta.com',
  docsite: OKTA_DOC_URL,
  supportsTriggers: false,
  supportsManagedCreation: false,
  supportsIcon: false,
  encryptedFields: ['clientSecret', 'registrationAccessToken'],
  supportedSubjectTypes: ['user', 'app'],
  connectionMethods: [
    {
      connectionMethod: 'org-server',
      type: oauthType({
        createInputDefaults: {
          serverConfig: {
            authorization_endpoint: 'https://{domain}/oauth2/v1/authorize',
            token_endpoint: 'https://{domain}/oauth2/v1/token',
            issuer: 'https://{domain}',
          },
        },
      }),
      label: 'Org Authorization Server (OAuth 2.0)',
      description:
        'Use this if your Issuer URI is a domain with no /oauth2/ segment.',
      docUrl: OKTA_DOC_URL,
      templateFields: [
        {
          key: 'domain',
          label: 'Okta domain',
          placeholder: 'acme.okta.com',
          help: 'Your Okta domain, without the https:// prefix.',
        },
      ],
      create: { managed: false, manual: true },
    },
    {
      connectionMethod: 'custom-server',
      type: oauthType({
        createInputDefaults: {
          serverConfig: {
            authorization_endpoint:
              'https://{domain}/oauth2/{auth_server_id}/v1/authorize',
            token_endpoint: 'https://{domain}/oauth2/{auth_server_id}/v1/token',
            issuer: 'https://{domain}/oauth2/{auth_server_id}',
          },
        },
      }),
      label: 'Custom Authorization Server (OAuth 2.0)',
      description:
        'Use this if your Issuer URI has a segment like /oauth2/[server id].',
      docUrl: OKTA_DOC_URL,
      templateFields: [
        {
          key: 'domain',
          label: 'Okta domain',
          placeholder: 'acme.okta.com',
          help: 'Your Okta domain, without the https:// prefix.',
        },
        {
          key: 'auth_server_id',
          label: 'Authorization Server ID',
          placeholder: 'default',
          help: "Either 'default' or a custom server ID, shown in Okta under Security > API > Authorization Servers.",
          default: 'default',
        },
      ],
      create: { managed: false, manual: true },
    },
  ],
  types: [oauthType()],
};

/**
 * A template method whose field carries a `default`, so the vended
 * `serverConfig` arrives already substituted rather than as a raw
 * `{placeholder}` — the opposite of okta, and why a client can't validate a
 * template value by substituting it locally.
 */
export const workosServiceInfo = {
  service: 'workos',
  name: 'WorkOS',
  website: 'https://workos.com',
  supportsTriggers: false,
  supportsManagedCreation: false,
  supportsIcon: false,
  encryptedFields: ['clientSecret', 'registrationAccessToken'],
  supportedSubjectTypes: ['user', 'app'],
  connectionMethods: [
    {
      connectionMethod: 'oauth',
      type: oauthType({
        createInputDefaults: {
          serverConfig: {
            authorization_endpoint: 'https://api.workos.com/sso/authorize',
            token_endpoint: 'https://api.workos.com/sso/token',
            userinfo_endpoint: 'https://api.workos.com/sso/profile',
            token_endpoint_auth_methods_supported: ['client_secret_post'],
          },
        },
      }),
      label: 'OAuth 2.0',
      templateFields: [
        {
          key: 'domain',
          label: 'WorkOS domain',
          placeholder: 'api.workos.com',
          default: 'api.workos.com',
        },
      ],
      create: { managed: false, manual: true },
    },
  ],
  types: [oauthType()],
};

/** Two managed methods — the multi-managed routing case. `wif` can't be BYO. */
export const snowflakeServiceInfo = {
  service: 'snowflake',
  name: 'Snowflake',
  website: 'https://www.snowflake.com',
  docsite: 'https://docs.snowflake.com',
  supportsTriggers: false,
  supportsManagedCreation: true,
  supportsIcon: false,
  encryptedFields: [],
  supportedSubjectTypes: ['app'],
  connectionMethods: [
    {
      connectionMethod: 'wif',
      type: {
        type: 'snowflake-wif',
        name: 'Snowflake WIF',
        supportsIcon: false,
        supportsTriggers: false,
        supportsInstallation: false,
        supportsRevocation: false,
        supportsManagedCreation: true,
        encryptedFields: [],
        supportedSubjectTypes: ['app'],
        data: {},
      },
      label: 'Workload Identity Federation',
      create: { managed: true, manual: false },
    },
    {
      connectionMethod: 'partner-connect',
      type: {
        type: 'snowflake',
        name: 'Snowflake Partner Connect',
        supportsIcon: false,
        supportsTriggers: false,
        supportsInstallation: false,
        supportsRevocation: false,
        supportsManagedCreation: true,
        encryptedFields: [],
        supportedSubjectTypes: ['app'],
        data: {},
      },
      label: 'Partner Connect',
      create: { managed: true, manual: true },
    },
  ],
  types: [],
};

/** One method offering both create paths — managed wins unless `--data`. */
export const slackServiceInfo = {
  service: 'slack',
  name: 'Slack',
  icon: '/static/integrations/slack.svg',
  website: 'https://slack.com',
  devsite: 'https://api.slack.com/apps',
  docsite: 'https://api.slack.com/docs',
  supportsTriggers: true,
  supportsManagedCreation: true,
  supportsIcon: true,
  encryptedFields: ['clientSecret', 'signingSecret'],
  supportedSubjectTypes: ['user', 'app'],
  connectionMethods: [
    {
      connectionMethod: 'slack-app',
      type: {
        type: 'slack',
        name: 'Slack',
        supportsIcon: true,
        supportsTriggers: true,
        supportsInstallation: true,
        supportsRevocation: true,
        supportsManagedCreation: true,
        createInputSchema: {
          type: 'object',
          title: 'type:slack',
          required: ['clientId', 'clientSecret'],
          properties: {
            clientId: { type: 'string' },
            clientSecret: { type: 'string' },
            signingSecret: { type: 'string' },
          },
        },
        encryptedFields: ['clientSecret', 'signingSecret'],
        supportedSubjectTypes: ['user', 'app'],
        data: {},
      },
      label: 'Slack app',
      create: { managed: true, manual: true },
    },
  ],
  types: [],
};

/** One api-key method, no targets — the simplest confirm-prompt case. */
export const npmServiceInfo = {
  service: 'npm',
  name: 'npm',
  icon: '/static/connex/npm.svg',
  website: 'https://www.npmjs.com',
  devsite: 'https://www.npmjs.com/settings/~/tokens',
  docsite: 'https://docs.npmjs.com',
  supportsTriggers: false,
  supportsManagedCreation: false,
  supportsIcon: false,
  encryptedFields: ['value'],
  supportedSubjectTypes: ['app'],
  connectionMethods: [
    {
      connectionMethod: 'access-token',
      type: apiKeyType(),
      label: 'Access token',
      docUrl: 'https://docs.npmjs.com/creating-and-viewing-access-tokens',
      settingsUrl: 'https://www.npmjs.com/settings/~/tokens',
      serviceUrls: ['https://registry.npmjs.org'],
      instructions:
        'Create a granular access token at [npmjs.com → Access Tokens](https://www.npmjs.com/settings/~/tokens) and paste it below.',
      create: { managed: false, manual: true },
    },
  ],
  types: [apiKeyType()],
};

/**
 * A registered service that publishes no `connectionMethods[]` — the
 * fall-through case that must keep the pre-connection-method behavior.
 */
export const githubServiceInfo = {
  service: 'github',
  name: 'GitHub',
  website: 'https://github.com',
  supportsTriggers: true,
  supportsManagedCreation: true,
  supportsIcon: false,
  encryptedFields: [],
  supportedSubjectTypes: ['user', 'app'],
  types: [
    {
      type: 'github',
      name: 'GitHub',
      supportsIcon: false,
      supportsTriggers: true,
      supportsInstallation: true,
      supportsRevocation: false,
      supportsManagedCreation: true,
      encryptedFields: [],
      supportedSubjectTypes: ['user', 'app'],
      data: {},
    },
  ],
};

export const connexServiceFixtures: Record<string, unknown> = {
  notion: notionServiceInfo,
  okta: oktaServiceInfo,
  workos: workosServiceInfo,
  snowflake: snowflakeServiceInfo,
  slack: slackServiceInfo,
  npm: npmServiceInfo,
  github: githubServiceInfo,
};

/**
 * Serves `GET /v1/connect/services/:service` as a 404 for every slug — the
 * fall-through premise for services the registry doesn't describe. `create`
 * looks up connection methods before every non-`--data` create, so managed
 * POST-first tests declare this to show they take the legacy path on purpose.
 */
export function useConnexServiceNotFound(client: MockClient): void {
  useConnexServices(client, {});
}

/**
 * Serves `GET /v1/connect/services/:service`. Unknown slugs 404, matching the
 * API and exercising the CLI's fall-through to the legacy managed create.
 * Returns the requested URLs so tests can assert `?schemas=true` and teamId.
 */
export function useConnexServices(
  client: MockClient,
  services: Record<string, unknown> = connexServiceFixtures
): { requests: string[] } {
  const requests: string[] = [];
  client.scenario.get('/v1/connect/services/:service', (req, res) => {
    requests.push(req.url ?? '');
    const slug = (req.params as { service: string }).service;
    const info = services[slug];
    if (!info) {
      res.statusCode = 404;
      res.json({ error: { code: 'not_found', message: 'Not Found' } });
      return;
    }
    res.json(info);
  });
  return { requests };
}

/** A `ConnexClient` shaped as the create endpoints return it. */
export function fakeConnexClient(overrides: Record<string, unknown> = {}) {
  return {
    id: 'scl_test123',
    ownerId: 'team_abc',
    createdAt: 0,
    updatedAt: 0,
    uid: 'uid_abc',
    type: 'slack',
    name: 'my-bot',
    data: {},
    typeName: 'Slack',
    supportedSubjectTypes: ['user'],
    supportsInstallation: false,
    ...overrides,
  };
}

/** The request body a mocked create route received. */
export interface ConnexCreateCapture {
  body?: any;
}

/** Mocks `POST /v1/connect/connectors` and captures the body it was sent. */
export function mockConnexCreate(
  client: MockClient,
  overrides: Record<string, unknown> = {}
): ConnexCreateCapture {
  const captured: ConnexCreateCapture = {};
  client.scenario.post('/v1/connect/connectors', (req, res) => {
    captured.body = req.body;
    res.json(fakeConnexClient(overrides));
  });
  return captured;
}

/** Mocks `POST /v1/connect/connectors/managed` and captures the body. */
export function mockConnexManagedCreate(
  client: MockClient,
  overrides: Record<string, unknown> = {}
): ConnexCreateCapture {
  const captured: ConnexCreateCapture = {};
  client.scenario.post('/v1/connect/connectors/managed', (req, res) => {
    captured.body = req.body;
    res.json(fakeConnexClient(overrides));
  });
  return captured;
}
