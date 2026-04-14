import { describe, expect, it } from 'vitest';

import type {
  BuildOutputConfig,
  BuildResultV2TypicalWithCron,
  DeploymentFlagLegacy,
  DeploymentFlags,
  SerializedLambda,
  Service,
} from '../src';

describe('deserialize shared types', () => {
  it('allows deploymentId and services on BuildOutputConfig', () => {
    const service: Service = {
      name: 'api',
      type: 'web',
      workspace: 'services/api',
      builder: {
        use: '@vercel/node',
      },
    };

    const config: BuildOutputConfig = {
      version: 3,
      deploymentId: 'dpl_123',
      services: [service],
      crons: [
        {
          path: '/api/cron',
          schedule: '0 0 * * *',
        },
      ],
    };

    expect(config.deploymentId).toBe('dpl_123');
    expect(config.services?.[0]?.name).toBe('api');
    expect(config.crons?.[0]?.schedule).toBe('0 0 * * *');
  });

  it('supports both current and legacy flags on BuildResultV2TypicalWithCron', () => {
    const currentFlags: DeploymentFlags = {
      definitions: {
        foo: {
          description: 'flag',
          url: 'https://example.com/flags/foo',
        },
      },
    };

    const legacyFlags: DeploymentFlagLegacy[] = [
      {
        key: 'foo',
        metadata: {
          description: 'flag',
        },
      },
    ];

    const currentBuildResult: BuildResultV2TypicalWithCron = {
      output: {},
      flags: currentFlags,
      deploymentId: 'dpl_123',
      meta: {
        hasServerActions: true,
      },
    };

    const legacyBuildResult: BuildResultV2TypicalWithCron = {
      output: {},
      flags: legacyFlags,
    };

    expect(currentBuildResult.meta?.hasServerActions).toBe(true);
    expect(currentBuildResult.deploymentId).toBe('dpl_123');
    expect(currentFlags.definitions.foo?.url).toBe(
      'https://example.com/flags/foo'
    );
    expect(Array.isArray(legacyBuildResult.flags)).toBe(true);
  });

  it('supports filePathMap on serialized lambdas', () => {
    const serializedLambda: SerializedLambda = {
      type: 'Lambda',
      architecture: 'x86_64',
      environment: {},
      runtime: 'nodejs20.x',
      handler: 'index.handler',
      supportsResponseStreaming: false,
      filePathMap: {
        'index.js': 'apps/api/index.js',
      },
    };

    expect(serializedLambda.filePathMap?.['index.js']).toBe(
      'apps/api/index.js'
    );
  });
});
