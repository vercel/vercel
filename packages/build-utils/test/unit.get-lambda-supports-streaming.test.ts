import { describe, expect, it } from 'vitest';
import { getLambdaSupportsStreaming } from '../src/process-serverless/get-lambda-supports-streaming';

describe('getLambdaSupportsStreaming()', () => {
  it('returns true when forceStreamingRuntime is true', async () => {
    const result = await getLambdaSupportsStreaming(
      {
        handler: 'handler.py',
        runtime: 'python3.8',
      },
      true
    );
    expect(result.supportsStreaming).toEqual(true);
    expect(result.error).toBeUndefined();
  });

  it('honors `supportsResponseStreaming` from the lambda', async () => {
    const result = await getLambdaSupportsStreaming(
      {
        supportsResponseStreaming: false,
        launcherType: 'Nodejs',
        handler: 'handler.js',
        runtime: 'nodejs20.x',
      },
      false
    );
    expect(result.supportsStreaming).toEqual(false);
    expect(result.error).toBeUndefined();
  });

  it('returns true when launcherType is Nodejs', async () => {
    const result = await getLambdaSupportsStreaming(
      {
        launcherType: 'Nodejs',
        handler: 'handler.js',
        runtime: 'nodejs20.x',
      },
      false
    );
    expect(result.supportsStreaming).toEqual(true);
    expect(result.error).toBeUndefined();
  });

  it('returns undefined when launcherType is not Nodejs', async () => {
    const result = await getLambdaSupportsStreaming(
      {
        handler: 'handler.py',
        runtime: 'python3.8',
      },
      false
    );
    expect(result.supportsStreaming).toEqual(undefined);
    expect(result.error).toBeUndefined();
  });

  it('honors supportsResponseStreaming for non-Nodejs runtimes', async () => {
    const result = await getLambdaSupportsStreaming(
      {
        handler: 'handler.py',
        runtime: 'python3.8',
        supportsResponseStreaming: true,
      },
      false
    );
    expect(result.supportsStreaming).toEqual(true);
    expect(result.error).toBeUndefined();
  });
});
