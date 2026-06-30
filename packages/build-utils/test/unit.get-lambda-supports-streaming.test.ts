import { describe, expect, it } from 'vitest';
import { getLambdaSupportsStreaming } from '../src/process-serverless/get-lambda-supports-streaming';

describe('getLambdaSupportsStreaming()', () => {
  it('returns true when forceStreamingRuntime is true', async () => {
    const result = getLambdaSupportsStreaming(
      {
        handler: 'handler.py',
        runtime: 'python3.8',
      },
      true
    );
    expect(result).toEqual(true);
  });

  it('honors `supportsResponseStreaming` from the lambda', async () => {
    const result = getLambdaSupportsStreaming(
      {
        supportsResponseStreaming: false,
        launcherType: 'Nodejs',
        handler: 'handler.js',
        runtime: 'nodejs20.x',
      },
      false
    );
    expect(result).toEqual(false);
  });

  it('returns true when launcherType is Nodejs', async () => {
    const result = getLambdaSupportsStreaming(
      {
        launcherType: 'Nodejs',
        handler: 'handler.js',
        runtime: 'nodejs20.x',
      },
      false
    );
    expect(result).toEqual(true);
  });

  it('returns undefined when launcherType is not Nodejs', async () => {
    const result = getLambdaSupportsStreaming(
      {
        handler: 'handler.py',
        runtime: 'python3.8',
      },
      false
    );
    expect(result).toEqual(undefined);
  });

  it('honors supportsResponseStreaming for non-Nodejs runtimes', async () => {
    const result = getLambdaSupportsStreaming(
      {
        handler: 'handler.py',
        runtime: 'python3.8',
        supportsResponseStreaming: true,
      },
      false
    );
    expect(result).toEqual(true);
  });

  it('returns false when awsLambdaHandler is set on a Nodejs lambda', async () => {
    const result = getLambdaSupportsStreaming(
      {
        awsLambdaHandler: 'index.handler',
        launcherType: 'Nodejs',
        handler: 'index.js',
        runtime: 'nodejs20.x',
      },
      false
    );
    expect(result).toEqual(false);
  });

  it('returns false for awsLambdaHandler even when forceStreamingRuntime is true', async () => {
    const result = getLambdaSupportsStreaming(
      {
        awsLambdaHandler: 'index.handler',
        launcherType: 'Nodejs',
        handler: 'index.js',
        runtime: 'nodejs20.x',
      },
      true
    );
    expect(result).toEqual(false);
  });

  it('returns false for awsLambdaHandler even when supportsResponseStreaming is true', async () => {
    const result = getLambdaSupportsStreaming(
      {
        awsLambdaHandler: 'index.handler',
        supportsResponseStreaming: true,
        launcherType: 'Nodejs',
        handler: 'index.js',
        runtime: 'nodejs20.x',
      },
      false
    );
    expect(result).toEqual(false);
  });

  it('treats empty awsLambdaHandler as not-an-AWS-handler', async () => {
    const result = getLambdaSupportsStreaming(
      {
        awsLambdaHandler: '',
        launcherType: 'Nodejs',
        handler: 'handler.js',
        runtime: 'nodejs20.x',
      },
      false
    );
    expect(result).toEqual(true);
  });
});
