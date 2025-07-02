import { describe, it, expect } from 'vitest';
import { validateConfig } from '../../../../src/util/validate-config';

describe('validateConfig', () => {
  it('should not error with empty config', async () => {
    const config = {};
    const error = validateConfig(config);
    expect(error).toBeNull();
  });

  it('should not error with complete config', async () => {
    const config = {
      version: 2,
      public: true,
      regions: ['sfo1', 'iad1'],
      cleanUrls: true,
      headers: [{ source: '/', headers: [{ key: 'x-id', value: '123' }] }],
      rewrites: [{ source: '/help', destination: '/support' }],
      redirects: [{ source: '/kb', destination: 'https://example.com' }],
      trailingSlash: false,
      functions: { 'api/user.go': { memory: 128, maxDuration: 5 } },
    };
    const error = validateConfig(config);
    expect(error).toBeNull();
  });

  it('should not error with builds and routes', async () => {
    const config = {
      builds: [{ src: 'api/index.js', use: '@vercel/node' }],
      routes: [{ src: '/(.*)', dest: '/api/index.js' }],
    };
    const error = validateConfig(config);
    expect(error).toBeNull();
  });

  it('should error with invalid rewrites due to additional property and offer suggestion', async () => {
    const error = validateConfig({
      // @ts-ignore
      rewrites: [{ src: '/(.*)', dest: '/api/index.js' }],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `rewrites[0]` should NOT have additional property `src`. Did you mean `source`?'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#rewrites'
    );
  });

  it('should error with invalid routes due to additional property and offer suggestion', async () => {
    const error = validateConfig({
      // @ts-ignore
      routes: [{ source: '/(.*)', destination: '/api/index.js' }],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `routes[0]` should NOT have additional property `source`. Did you mean `src`?'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#routes'
    );
  });

  it('should error with invalid routes array type', async () => {
    const error = validateConfig({
      // @ts-ignore
      routes: { src: '/(.*)', dest: '/api/index.js' },
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `routes` should be array.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#routes'
    );
  });

  it('should error with invalid redirects array object', async () => {
    const error = validateConfig({
      redirects: [
        // @ts-ignore
        {
          /* intentionally empty */
        },
      ],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `redirects[0]` missing required property `source`.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#redirects'
    );
  });

  it('should error with invalid redirects.permanent poperty', async () => {
    const error = validateConfig({
      // @ts-ignore
      redirects: [{ source: '/', destination: '/go', permanent: 'yes' }],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `redirects[0].permanent` should be boolean.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#redirects'
    );
  });

  it('should error with invalid cleanUrls type', async () => {
    const error = validateConfig({
      // @ts-ignore
      cleanUrls: 'true',
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `cleanUrls` should be boolean.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#cleanurls'
    );
  });

  it('should error with invalid trailingSlash type', async () => {
    const error = validateConfig({
      // @ts-ignore
      trailingSlash: [true],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `trailingSlash` should be boolean.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#trailingslash'
    );
  });

  it('should error with invalid headers property', async () => {
    const error = validateConfig({
      // @ts-ignore
      headers: [{ 'Content-Type': 'text/html' }],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `headers[0]` should NOT have additional property `Content-Type`. Please remove it.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#headers'
    );
  });

  it('should error with invalid headers.source type', async () => {
    const error = validateConfig({
      // @ts-ignore
      headers: [{ source: [{ 'Content-Type': 'text/html' }] }],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `headers[0].source` should be string.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#headers'
    );
  });

  it('should error with invalid headers additional property', async () => {
    const error = validateConfig({
      // @ts-ignore
      headers: [{ source: '/', stuff: [{ 'Content-Type': 'text/html' }] }],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `headers[0]` should NOT have additional property `stuff`. Please remove it.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#headers'
    );
  });

  it('should error with invalid headers wrong nested headers type', async () => {
    const error = validateConfig({
      // @ts-ignore
      headers: [{ source: '/', headers: [{ 'Content-Type': 'text/html' }] }],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `headers[0].headers[0]` should NOT have additional property `Content-Type`. Please remove it.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#headers'
    );
  });

  it('should error with invalid headers wrong nested headers additional property', async () => {
    const error = validateConfig({
      headers: [
        // @ts-ignore
        { source: '/', headers: [{ key: 'Content-Type', val: 'text/html' }] },
      ],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `headers[0].headers[0]` should NOT have additional property `val`. Please remove it.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#headers'
    );
  });

  it('should error with too many redirects', async () => {
    const error = validateConfig({
      redirects: Array.from({ length: 5000 }).map((_, i) => ({
        source: `/${i}`,
        destination: `/v/${i}`,
      })),
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `redirects` should NOT have more than 2048 items.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#redirects'
    );
  });

  it('should error with too many nested headers', async () => {
    const error = validateConfig({
      headers: [
        {
          source: '/',
          headers: [{ key: `x-id`, value: `123` }],
        },
        {
          source: '/too-many',
          headers: Array.from({ length: 5000 }).map((_, i) => ({
            key: `${i}`,
            value: `${i}`,
          })),
        },
      ],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `headers[1].headers` should NOT have more than 1024 items.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#headers'
    );
  });

  it('should error with too low memory value', async () => {
    const error = validateConfig({
      functions: {
        'api/test.js': {
          memory: 127,
        },
      },
    });
    expect(error!.message).toEqual(
      "Invalid vercel.json - `functions['api/test.js'].memory` should be >= 128."
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#functions'
    );
  });

  it('should error with too high memory value', async () => {
    const error = validateConfig({
      functions: {
        'api/test.js': {
          memory: 10241,
        },
      },
    });
    expect(error!.message).toEqual(
      "Invalid vercel.json - `functions['api/test.js'].memory` should be <= 10240."
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#functions'
    );
  });

  it('should error with "functions" and "builds"', async () => {
    const error = validateConfig({
      builds: [
        {
          src: 'index.html',
          use: '@vercel/static',
        },
      ],
      functions: {
        'api/test.js': {
          memory: 1024,
        },
      },
    });
    expect(error!.message).toEqual(
      'The `functions` property cannot be used in conjunction with the `builds` property. Please remove one of them.'
    );

    expect(error!.link).toEqual('https://vercel.link/functions-and-builds');
  });

  it('should error when crons have missing schedule', () => {
    const error = validateConfig({
      // @ts-ignore
      crons: [{ path: '/api/test.js' }],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `crons[0]` missing required property `schedule`.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#crons'
    );
  });

  it('should error when crons have missing path', () => {
    const error = validateConfig({
      // @ts-ignore
      crons: [{ schedule: '* * * * *' }],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `crons[0]` missing required property `path`.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#crons'
    );
  });

  it('should error when path is too long', () => {
    const error = validateConfig({
      crons: [{ path: '/' + 'x'.repeat(512), schedule: '* * * * *' }],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `crons[0].path` should NOT be longer than 512 characters.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#crons'
    );
  });

  it('should error when schedule is too long', () => {
    const error = validateConfig({
      crons: [{ path: '/', schedule: '*'.repeat(257) }],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `crons[0].schedule` should NOT be longer than 256 characters.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#crons'
    );
  });

  it('should error when path is empty', () => {
    const error = validateConfig({
      crons: [{ path: '', schedule: '* * * * *' }],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `crons[0].path` should NOT be shorter than 1 characters.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#crons'
    );
  });

  it('should error when schedule is too short', () => {
    const error = validateConfig({
      crons: [{ path: '/', schedule: '* * * * ' }],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `crons[0].schedule` should NOT be shorter than 9 characters.'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#crons'
    );
  });

  it("should error when path doesn't start with `/`", () => {
    const error = validateConfig({
      crons: [{ path: 'api/cron', schedule: '* * * * *' }],
    });
    expect(error!.message).toEqual(
      'Invalid vercel.json - `crons[0].path` should match pattern "^/.*".'
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#crons'
    );
  });

  it.each(['x86_64', 'arm64'] as const)(
    'should not error with valid architecture: %s',
    architecture => {
      const error = validateConfig({
        functions: {
          'api/user.go': { architecture, memory: 128, maxDuration: 5 },
        },
      });
      expect(error).toBeNull();
    }
  );

  it('should error with invalid architecture', () => {
    const error = validateConfig({
      functions: {
        // @ts-ignore
        'api/user.go': { architecture: 'invalid', memory: 128, maxDuration: 5 },
      },
    });
    expect(error!.message).toEqual(
      "Invalid vercel.json - `functions['api/user.go'].architecture` should be equal to one of the allowed values."
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#functions'
    );
  });

  it('should not error with valid experimentalTriggers', () => {
    const error = validateConfig({
      functions: {
        'api/webhook.js': {
          experimentalTriggers: [
            {
              triggerVersion: 1,
              specversion: '1.0',
              type: 'com.vercel.queue.v1',
              httpBinding: {
                mode: 'structured',
                method: 'POST',
                pathname: '/webhook',
              },
              queue: {
                topic: 'user-events',
                consumer: 'webhook-processors',
                maxAttempts: 3,
                retryAfterSeconds: 10,
                initialDelaySeconds: 0,
              },
            },
          ],
        },
      },
    });
    expect(error).toBeNull();
  });

  it('should not error with minimal experimentalTriggers configuration', () => {
    const error = validateConfig({
      functions: {
        'api/trigger.js': {
          experimentalTriggers: [
            {
              triggerVersion: 1,
              specversion: '1.0',
              type: 'v1.test.vercel.com',
              httpBinding: {
                mode: 'structured',
                method: 'POST',
              },
            },
          ],
        },
      },
    });
    expect(error).toBeNull();
  });

  it('should error with invalid experimentalTriggers type', () => {
    const error = validateConfig({
      functions: {
        // @ts-ignore
        'api/test.js': { experimentalTriggers: 'invalid' },
      },
    });
    expect(error!.message).toEqual(
      "Invalid vercel.json - `functions['api/test.js'].experimentalTriggers` should be array."
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#functions'
    );
  });

  it('should error with invalid triggerVersion', () => {
    const error = validateConfig({
      functions: {
        'api/test.js': {
          experimentalTriggers: [
            {
              // @ts-ignore
              triggerVersion: 2,
              specversion: '1.0',
              type: 'v1.test.vercel.com',
              httpBinding: { mode: 'structured', method: 'POST' },
            },
          ],
        },
      },
    });
    expect(error!.message).toEqual(
      "Invalid vercel.json - `functions['api/test.js'].experimentalTriggers[0].triggerVersion` should be equal to constant."
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#functions'
    );
  });

  it('should error with invalid specversion', () => {
    const error = validateConfig({
      functions: {
        'api/test.js': {
          experimentalTriggers: [
            {
              triggerVersion: 1,
              // @ts-ignore
              specversion: '2.0',
              type: 'v1.test.vercel.com',
              httpBinding: { mode: 'structured', method: 'POST' },
            },
          ],
        },
      },
    });
    expect(error!.message).toEqual(
      "Invalid vercel.json - `functions['api/test.js'].experimentalTriggers[0].specversion` should be equal to constant."
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#functions'
    );
  });

  it('should error with missing type', () => {
    const error = validateConfig({
      functions: {
        'api/test.js': {
          experimentalTriggers: [
            // @ts-ignore - intentionally missing type property for testing
            {
              triggerVersion: 1,
              specversion: '1.0',
              httpBinding: { mode: 'structured', method: 'POST' },
            },
          ],
        },
      },
    });
    expect(error!.message).toEqual(
      "Invalid vercel.json - `functions['api/test.js'].experimentalTriggers[0]` missing required property `type`."
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#functions'
    );
  });

  it('should error with invalid httpBinding mode', () => {
    const error = validateConfig({
      functions: {
        'api/test.js': {
          experimentalTriggers: [
            {
              triggerVersion: 1,
              specversion: '1.0',
              type: 'v1.test.vercel.com',
              // @ts-ignore
              httpBinding: { mode: 'binary', method: 'POST' },
            },
          ],
        },
      },
    });
    expect(error!.message).toEqual(
      "Invalid vercel.json - `functions['api/test.js'].experimentalTriggers[0].httpBinding.mode` should be equal to constant."
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#functions'
    );
  });

  it('should error with invalid HTTP method', () => {
    const error = validateConfig({
      functions: {
        'api/test.js': {
          experimentalTriggers: [
            {
              triggerVersion: 1,
              specversion: '1.0',
              type: 'v1.test.vercel.com',
              httpBinding: {
                mode: 'structured',
                // @ts-ignore
                method: 'PUT',
              },
            },
          ],
        },
      },
    });
    expect(error!.message).toEqual(
      "Invalid vercel.json - `functions['api/test.js'].experimentalTriggers[0].httpBinding.method` should be equal to constant."
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#functions'
    );
  });

  it('should error with missing HTTP method', () => {
    const error = validateConfig({
      functions: {
        'api/test.js': {
          experimentalTriggers: [
            {
              triggerVersion: 1,
              specversion: '1.0',
              type: 'v1.test.vercel.com',
              // @ts-ignore - intentionally missing method property
              httpBinding: {
                mode: 'structured',
              },
            },
          ],
        },
      },
    });
    expect(error!.message).toEqual(
      "Invalid vercel.json - `functions['api/test.js'].experimentalTriggers[0].httpBinding` missing required property `method`."
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#functions'
    );
  });

  it('should error with queue trigger missing required fields', () => {
    const error = validateConfig({
      functions: {
        'api/test.js': {
          experimentalTriggers: [
            {
              triggerVersion: 1,
              specversion: '1.0',
              type: 'com.vercel.queue.v1',
              httpBinding: { mode: 'structured', method: 'POST' },
              // @ts-ignore - missing queue configuration
            },
          ],
        },
      },
    });
    expect(error!.message).toEqual(
      "Invalid vercel.json - `functions['api/test.js'].experimentalTriggers[0]` missing required property `.queue`."
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#functions'
    );
  });

  it('should error with invalid queue configuration', () => {
    const error = validateConfig({
      functions: {
        'api/test.js': {
          experimentalTriggers: [
            {
              triggerVersion: 1,
              specversion: '1.0',
              type: 'com.vercel.queue.v1',
              httpBinding: { mode: 'structured', method: 'POST' },
              // @ts-ignore - intentionally missing consumer property for testing
              queue: {
                topic: 'test-topic',
              },
            },
          ],
        },
      },
    });
    expect(error!.message).toEqual(
      "Invalid vercel.json - `functions['api/test.js'].experimentalTriggers[0].queue` missing required property `consumer`."
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#functions'
    );
  });

  it('should error with invalid maxAttempts type', () => {
    const error = validateConfig({
      functions: {
        'api/test.js': {
          experimentalTriggers: [
            {
              triggerVersion: 1,
              specversion: '1.0',
              type: 'com.vercel.queue.v1',
              httpBinding: { mode: 'structured', method: 'POST' },
              queue: {
                topic: 'test-topic',
                consumer: 'test-consumer',
                // @ts-ignore
                maxAttempts: 'three',
              },
            },
          ],
        },
      },
    });
    expect(error!.message).toEqual(
      "Invalid vercel.json - `functions['api/test.js'].experimentalTriggers[0].queue.maxAttempts` should be number."
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#functions'
    );
  });

  it('should error with negative maxAttempts', () => {
    const error = validateConfig({
      functions: {
        'api/test.js': {
          experimentalTriggers: [
            {
              triggerVersion: 1,
              specversion: '1.0',
              type: 'com.vercel.queue.v1',
              httpBinding: { mode: 'structured', method: 'POST' },
              queue: {
                topic: 'test-topic',
                consumer: 'test-consumer',
                maxAttempts: -1,
              },
            },
          ],
        },
      },
    });
    expect(error!.message).toEqual(
      "Invalid vercel.json - `functions['api/test.js'].experimentalTriggers[0].queue.maxAttempts` should be >= 0."
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#functions'
    );
  });

  it('should error with zero retryAfterSeconds', () => {
    const error = validateConfig({
      functions: {
        'api/test.js': {
          experimentalTriggers: [
            {
              triggerVersion: 1,
              specversion: '1.0',
              type: 'com.vercel.queue.v1',
              httpBinding: { mode: 'structured', method: 'POST' },
              queue: {
                topic: 'test-topic',
                consumer: 'test-consumer',
                retryAfterSeconds: 0,
              },
            },
          ],
        },
      },
    });
    expect(error!.message).toEqual(
      "Invalid vercel.json - `functions['api/test.js'].experimentalTriggers[0].queue.retryAfterSeconds` should be > 0."
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#functions'
    );
  });

  it('should error with negative initialDelaySeconds', () => {
    const error = validateConfig({
      functions: {
        'api/test.js': {
          experimentalTriggers: [
            {
              triggerVersion: 1,
              specversion: '1.0',
              type: 'com.vercel.queue.v1',
              httpBinding: { mode: 'structured', method: 'POST' },
              queue: {
                topic: 'test-topic',
                consumer: 'test-consumer',
                initialDelaySeconds: -1,
              },
            },
          ],
        },
      },
    });
    expect(error!.message).toEqual(
      "Invalid vercel.json - `functions['api/test.js'].experimentalTriggers[0].queue.initialDelaySeconds` should be >= 0."
    );
    expect(error!.link).toEqual(
      'https://vercel.com/docs/concepts/projects/project-configuration#functions'
    );
  });

  it('should allow zero initialDelaySeconds', () => {
    const error = validateConfig({
      functions: {
        'api/test.js': {
          experimentalTriggers: [
            {
              triggerVersion: 1,
              specversion: '1.0',
              type: 'com.vercel.queue.v1',
              httpBinding: { mode: 'structured', method: 'POST' },
              queue: {
                topic: 'test-topic',
                consumer: 'test-consumer',
                initialDelaySeconds: 0,
              },
            },
          ],
        },
      },
    });
    expect(error).toBeNull();
  });
});
