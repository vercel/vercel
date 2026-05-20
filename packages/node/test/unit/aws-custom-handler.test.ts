import { describe, it, expect, afterEach } from 'vitest';
import { prepareFilesystem } from './test-utils';
import { build } from '../../src';
import type { NodejsLambda } from '@vercel/build-utils';

describe('AWS custom handler', () => {
  afterEach(() => {
    delete process.env.NODEJS_AWS_HANDLER_NAME;
  });

  it('should disable response streaming when NODEJS_AWS_HANDLER_NAME is set', async () => {
    process.env.NODEJS_AWS_HANDLER_NAME = 'myCustomHandler';

    const filesystem = await prepareFilesystem({
      'index.js': `
        exports.myCustomHandler = async function() {
          return {
            statusCode: 200,
            headers: {},
            body: 'custom handler',
          };
        };
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'index.js',
      config: {},
      meta: { skipDownload: true },
    });

    expect(buildResult.output).toBeDefined();
    expect(buildResult.output.type).toBe('Lambda');
    const lambda = buildResult.output as NodejsLambda;
    expect(lambda.supportsResponseStreaming).toBe(false);
    expect(lambda.awsLambdaHandler).toBe('index.myCustomHandler');
  });

  it('should not disable response streaming for regular handlers', async () => {
    const filesystem = await prepareFilesystem({
      'api/hello.js': `
        export default (req, res) => res.send('hello');
      `,
    });

    const buildResult = await build({
      ...filesystem,
      entrypoint: 'api/hello.js',
      config: {},
      meta: { skipDownload: true },
    });

    expect(buildResult.output).toBeDefined();
    expect(buildResult.output.type).toBe('Lambda');
    const lambda = buildResult.output as NodejsLambda;
    expect(lambda.supportsResponseStreaming).toBeUndefined();
    expect(lambda.awsLambdaHandler).toBe('');
  });
});
