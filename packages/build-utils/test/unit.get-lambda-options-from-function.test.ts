import { describe, expect, it } from 'vitest';
import { getLambdaOptionsFromFunction } from '../src/lambda';
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
});
