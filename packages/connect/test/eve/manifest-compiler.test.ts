import { describe, expect, it } from 'vitest';
import { experimental_createConnectManifestFromEveResources } from '../../src/manifest/index.js';

const snapshot = {
  generator: { name: 'eve', version: '1.2.3' },
  kind: 'eve-external-resources',
  resources: [
    {
      credentials: {
        reference: 'connector:oauth/linear',
        service: 'linear',
        subjectTypes: ['user'],
        method: 'oauth',
      },
      protocol: { type: 'mcp', url: 'https://mcp.linear.app/mcp' },
      kind: 'connection',
      logicalPath: 'connections/linear.ts',
      name: 'linear',
    },
    {
      credentials: {
        reference: 'connector:slack/support',
        service: 'slack',
        subjectTypes: ['app'],
        method: 'slack',
      },
      kind: 'channel',
      logicalPath: 'channels/slack.ts',
      manifest: {
        $type: 'https://docs.slack.dev/reference/app-manifest/',
        oauth_config: { scopes: { bot: ['chat:write'] } },
        settings: { event_subscriptions: { bot_events: ['app_mention'] } },
      },
      name: 'slack',
      route: { path: '/eve/v1/slack' },
    },
  ],
  schemaVersion: 1,
} as const;

describe('eve manifest compiler', () => {
  it('converts an eve resource snapshot into a Connect manifest', () => {
    expect(
      experimental_createConnectManifestFromEveResources(snapshot)
    ).toEqual({
      generator: { name: 'eve', version: '1.2.3' },
      kind: 'vercel-connect-manifest',
      requirements: [
        {
          connect: {
            manifest: {
              $type: 'https://datatracker.ietf.org/doc/html/rfc7591',
            },
            service: 'linear',
            subjectTypes: ['user'],
            type: 'oauth',
          },
          interfaces: [{ protocol: 'mcp', url: 'https://mcp.linear.app/mcp' }],
          target: 'connector:oauth/linear',
          triggers: [],
          uses: [
            {
              kind: 'connection',
              logicalPath: 'connections/linear.ts',
              name: 'linear',
            },
          ],
        },
        {
          connect: {
            manifest: {
              $type: 'https://docs.slack.dev/reference/app-manifest/',
              oauth_config: { scopes: { bot: ['chat:write'] } },
              settings: {
                event_subscriptions: { bot_events: ['app_mention'] },
              },
            },
            service: 'slack',
            subjectTypes: ['app'],
            type: 'slack',
          },
          interfaces: [],
          target: 'connector:slack/support',
          triggers: [{ path: '/eve/v1/slack' }],
          uses: [
            {
              kind: 'channel',
              logicalPath: 'channels/slack.ts',
              name: 'slack',
            },
          ],
        },
      ],
      schemaVersion: 1,
    });
  });

  it('omits a credential type when the eve requirement leaves method open', () => {
    const resource = snapshot.resources[0];
    const manifest = experimental_createConnectManifestFromEveResources({
      ...snapshot,
      resources: [
        {
          ...resource,
          credentials: {
            reference: resource.credentials.reference,
            service: resource.credentials.service,
            subjectTypes: resource.credentials.subjectTypes,
          },
        },
      ],
    });

    expect(manifest.requirements[0]?.connect).not.toHaveProperty('type');
  });

  it('combines resources that share a credential target', () => {
    const shared = snapshot.resources[0];
    const manifest = experimental_createConnectManifestFromEveResources({
      ...snapshot,
      resources: [
        shared,
        {
          ...shared,
          protocol: { type: 'openapi', url: 'https://api.linear.app' },
          logicalPath: 'connections/linear-api.ts',
          name: 'linear-api',
        },
      ],
    });

    expect(manifest.requirements).toHaveLength(1);
    expect(manifest.requirements[0]).toMatchObject({
      interfaces: [
        { protocol: 'mcp', url: 'https://mcp.linear.app/mcp' },
        { protocol: 'openapi', url: 'https://api.linear.app' },
      ],
      target: 'connector:oauth/linear',
      uses: [
        {
          kind: 'connection',
          logicalPath: 'connections/linear.ts',
          name: 'linear',
        },
        {
          kind: 'connection',
          logicalPath: 'connections/linear-api.ts',
          name: 'linear-api',
        },
      ],
    });
  });

  it('combines trigger paths for channels that share a credential target', () => {
    const shared = snapshot.resources[1];
    const manifest = experimental_createConnectManifestFromEveResources({
      ...snapshot,
      resources: [
        shared,
        {
          ...shared,
          logicalPath: 'channels/slack-secondary.ts',
          name: 'slack-secondary',
          route: { path: '/eve/v1/slack-secondary' },
        },
      ],
    });

    expect(manifest.requirements).toHaveLength(1);
    expect(manifest.requirements[0]?.triggers).toEqual([
      { path: '/eve/v1/slack' },
      { path: '/eve/v1/slack-secondary' },
    ]);
  });

  it.each([
    ['service', { service: 'linear-enterprise' }],
    ['method', { method: 'api-key' }],
  ])('rejects conflicting %s for one credential target', (field, credentials) => {
    const shared = snapshot.resources[0];

    expect(() =>
      experimental_createConnectManifestFromEveResources({
        ...snapshot,
        resources: [
          shared,
          {
            ...shared,
            credentials: { ...shared.credentials, ...credentials },
            logicalPath: 'connections/linear-conflict.ts',
          },
        ],
      })
    ).toThrow(
      `Conflicting declarations for credential target "connector:oauth/linear" in connections/linear.ts and connections/linear-conflict.ts: ${field} must agree.`
    );
  });

  it('rejects conflicting provider manifests for one credential target', () => {
    const shared = snapshot.resources[1];

    expect(() =>
      experimental_createConnectManifestFromEveResources({
        ...snapshot,
        resources: [
          shared,
          {
            ...shared,
            manifest: {
              ...shared.manifest,
              display_information: { name: 'other' },
            },
            logicalPath: 'channels/other-slack.ts',
          },
        ],
      })
    ).toThrow(
      'Conflicting declarations for credential target "connector:slack/support" in channels/slack.ts and channels/other-slack.ts: provider manifest must agree.'
    );
  });

  it('keeps credential-only channels and their delivery requirement', () => {
    const result = experimental_createConnectManifestFromEveResources({
      ...snapshot,
      resources: [
        {
          kind: 'channel',
          logicalPath: 'channels/github.ts',
          name: 'github',
          credentials: {
            reference: 'connector:github/agent',
            service: 'github',
            method: 'github',
            subjectTypes: ['app'],
          },
          route: { path: '/eve/v1/github' },
        },
      ],
    });
    expect(result.requirements[0]).toMatchObject({
      connect: {
        manifest: { $type: 'https://datatracker.ietf.org/doc/html/rfc7591' },
        service: 'github',
        type: 'github',
      },
      triggers: [{ path: '/eve/v1/github' }],
    });
  });

  it.each([
    false,
    true,
  ])('composes native channel and credential requirements regardless of order (%s)', reverse => {
    const channel = snapshot.resources[1];
    const connection = {
      ...snapshot.resources[0],
      protocol: { type: 'openapi', url: 'https://slack.com/api' },
      credentials: {
        reference: channel.credentials.reference,
        service: 'slack',
        subjectTypes: ['user'],
      },
    };
    const resources = reverse ? [connection, channel] : [channel, connection];
    const result = experimental_createConnectManifestFromEveResources({
      ...snapshot,
      resources,
    });
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0]).toMatchObject({
      connect: {
        manifest: channel.manifest,
        type: 'slack',
        subjectTypes: ['app', 'user'],
      },
      interfaces: [{ protocol: 'openapi', url: 'https://slack.com/api' }],
      triggers: [{ path: '/eve/v1/slack' }],
    });
    expect(result.requirements[0]?.uses).toHaveLength(2);
  });

  it('rejects an unsupported snapshot version', () => {
    expect(() =>
      experimental_createConnectManifestFromEveResources({
        ...snapshot,
        schemaVersion: 2,
      })
    ).toThrow(
      'Expected an eve-external-resources snapshot with schemaVersion 1.'
    );
  });

  it('rejects incomplete credential requirements', () => {
    expect(() =>
      experimental_createConnectManifestFromEveResources({
        ...snapshot,
        resources: [
          {
            ...snapshot.resources[0],
            credentials: { ...snapshot.resources[0].credentials, service: '' },
          },
        ],
      })
    ).toThrow(
      'Expected snapshot.resources[0].credentials.service to be a non-empty string.'
    );
  });
});
