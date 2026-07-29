import { describe, expect, it } from 'vitest';
import {
  getLambdaOptionsFromFunction,
  sanitizeConsumerName,
} from '../src/lambda';
import type { Config } from '../src/types';

describe('getLambdaOptionsFromFunction', () => {
  it('returns matching function options including regions', async () => {
    const config: Pick<Config, 'functions'> = {
      functions: {
        'api/*.js': {
          architecture: 'arm64',
          memory: 1024,
          maxDuration: 60,
          regions: ['sfo1', 'iad1'],
          functionFailoverRegions: ['dub1'],
        },
      },
    };

    const options = await getLambdaOptionsFromFunction({
      sourceFile: 'api/user.js',
      config,
    });

    expect(options).toMatchObject({
      architecture: 'arm64',
      memory: 1024,
      maxDuration: 60,
      regions: ['sfo1', 'iad1'],
      functionFailoverRegions: ['dub1'],
    });
  });

  it('returns matching function options with maxDuration set to "max"', async () => {
    const config: Pick<Config, 'functions'> = {
      functions: {
        'api/*.js': {
          memory: 1024,
          maxDuration: 'max',
        },
      },
    };

    const options = await getLambdaOptionsFromFunction({
      sourceFile: 'api/user.js',
      config,
    });

    expect(options).toMatchObject({
      memory: 1024,
      maxDuration: 'max',
    });
  });

  it('returns empty object when no function config matches', async () => {
    const config: Pick<Config, 'functions'> = {
      functions: {
        'api/*.ts': {
          regions: ['sfo1'],
        },
      },
    };

    const options = await getLambdaOptionsFromFunction({
      sourceFile: 'api/user.js',
      config,
    });

    expect(options).toEqual({});
  });

  // The top-level `maxDuration` default from `vercel.json` is intentionally
  // NOT resolved here — consumers with visibility into the Lambda's own value
  // (e.g. the CLI's write-build-result) apply it. Several builders (e.g.
  // @vercel/python) also rely on a `{}` return to mean "no pattern matched".
  it('ignores top-level maxDuration when no function pattern matches', async () => {
    const config: Pick<Config, 'functions' | 'maxDuration'> = {
      maxDuration: 30,
      functions: {
        'api/*.ts': { regions: ['sfo1'] },
      },
    };

    const options = await getLambdaOptionsFromFunction({
      sourceFile: 'api/user.js',
      config,
    });

    expect(options).toEqual({});
  });

  it('ignores top-level maxDuration when no functions config is set', async () => {
    const config: Pick<Config, 'maxDuration'> = {
      maxDuration: 60,
    };

    const options = await getLambdaOptionsFromFunction({
      sourceFile: 'api/user.js',
      config,
    });

    expect(options).toEqual({});
  });

  it('ignores top-level maxDuration when a function pattern matches', async () => {
    const config: Pick<Config, 'functions' | 'maxDuration'> = {
      maxDuration: 30,
      functions: {
        'api/*.js': { memory: 512, maxDuration: 120 },
      },
    };

    const options = await getLambdaOptionsFromFunction({
      sourceFile: 'api/user.js',
      config,
    });

    expect(options.maxDuration).toBe(120);
    expect(options.memory).toBe(512);
  });

  it('does not inherit top-level maxDuration when a matching function omits it', async () => {
    const config: Pick<Config, 'functions' | 'maxDuration'> = {
      maxDuration: 45,
      functions: {
        'api/*.js': { memory: 512 },
      },
    };

    const options = await getLambdaOptionsFromFunction({
      sourceFile: 'api/user.js',
      config,
    });

    expect(options.maxDuration).toBeUndefined();
    expect(options.memory).toBe(512);
  });

  it('derives the queue/v2beta consumer from the function pattern', async () => {
    const config: Pick<Config, 'functions'> = {
      functions: {
        'api/worker.js': {
          experimentalTriggers: [{ type: 'queue/v2beta', topic: 'orders' }],
        },
      },
    };

    const options = await getLambdaOptionsFromFunction({
      sourceFile: 'api/worker.js',
      config,
    });

    expect(options.experimentalTriggers).toEqual([
      {
        type: 'queue/v2beta',
        topic: 'orders',
        consumer: sanitizeConsumerName('api/worker.js'),
      },
    ]);
  });

  it('scopes the queue/v2beta consumer by serviceName when set', async () => {
    const config: Pick<Config, 'functions' | 'serviceName'> = {
      serviceName: 'orders-worker',
      functions: {
        'api/worker.js': {
          experimentalTriggers: [{ type: 'queue/v2beta', topic: 'orders' }],
        },
      },
    };

    const options = await getLambdaOptionsFromFunction({
      sourceFile: 'api/worker.js',
      config,
    });

    expect(options.experimentalTriggers).toEqual([
      {
        type: 'queue/v2beta',
        topic: 'orders',
        consumer: sanitizeConsumerName('orders-worker~api/worker.js'),
      },
    ]);

    // Two services that share the same function path derive distinct consumers.
    const other = await getLambdaOptionsFromFunction({
      sourceFile: 'api/worker.js',
      config: { ...config, serviceName: 'shipping-worker' },
    });
    expect(other.experimentalTriggers![0].consumer).not.toBe(
      options.experimentalTriggers![0].consumer
    );
  });

  it('does not scope non-v2beta triggers by serviceName', async () => {
    const config: Pick<Config, 'functions' | 'serviceName'> = {
      serviceName: 'orders-worker',
      functions: {
        'api/worker.js': {
          experimentalTriggers: [
            { type: 'queue/v1beta', topic: 'orders', consumer: 'fixed' },
          ],
        },
      },
    };

    const options = await getLambdaOptionsFromFunction({
      sourceFile: 'api/worker.js',
      config,
    });

    expect(options.experimentalTriggers).toEqual([
      { type: 'queue/v1beta', topic: 'orders', consumer: 'fixed' },
    ]);
  });
});
