import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@opensearch-project/opensearch', () => {
  class Client {
    public options: unknown;
    constructor(options: unknown) {
      this.options = options;
    }
  }
  return { Client };
});

vi.mock('@opensearch-project/opensearch/aws', () => ({
  AwsSigv4Signer: vi.fn((args: unknown) => ({ __signer: args })),
}));

vi.mock('@vercel/oidc-aws-credentials-provider', () => ({
  awsCredentialsProvider: vi.fn(() => async () => ({
    accessKeyId: 'AKIA_TEST',
    secretAccessKey: 'SECRET_TEST',
  })),
}));

import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';
import { createOpenSearch } from './opensearch';

const ENV_KEYS = ['OPENSEARCH_ENDPOINT', 'AWS_REGION', 'AWS_ROLE_ARN'] as const;

describe('createOpenSearch', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
    vi.clearAllMocks();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  test('uses Vercel-injected env vars when no options are provided', async () => {
    process.env.OPENSEARCH_ENDPOINT = 'https://example.aoss.amazonaws.com';
    process.env.AWS_REGION = 'us-east-2';
    process.env.AWS_ROLE_ARN = 'arn:aws:iam::1234567890:role/vercel-opensearch';

    const client = createOpenSearch();

    expect(AwsSigv4Signer).toHaveBeenCalledTimes(1);
    const signerArgs = (AwsSigv4Signer as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0][0] as {
      region: string;
      service: string;
      getCredentials: () => Promise<unknown>;
    };
    expect(signerArgs.region).toBe('us-east-2');
    expect(signerArgs.service).toBe('aoss');

    // Calling getCredentials should defer to awsCredentialsProvider with the role.
    await signerArgs.getCredentials();
    expect(awsCredentialsProvider).toHaveBeenCalledWith({
      roleArn: 'arn:aws:iam::1234567890:role/vercel-opensearch',
    });

    expect(
      (client as unknown as { options: { node: string } }).options.node
    ).toBe('https://example.aoss.amazonaws.com');
  });

  test('explicit options override env', () => {
    process.env.OPENSEARCH_ENDPOINT = 'https://env-endpoint.example';
    process.env.AWS_REGION = 'us-east-2';
    process.env.AWS_ROLE_ARN = 'arn:aws:iam::1:role/env';

    createOpenSearch({
      endpoint: 'https://override-endpoint.example',
      region: 'eu-west-1',
      roleArn: 'arn:aws:iam::2:role/override',
    });

    const signerArgs = (AwsSigv4Signer as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0][0] as { region: string };
    expect(signerArgs.region).toBe('eu-west-1');
    expect(awsCredentialsProvider).not.toHaveBeenCalled();
  });

  test('throws a helpful error when env vars are missing', () => {
    expect(() => createOpenSearch()).toThrow(
      /OPENSEARCH_ENDPOINT.*AWS_REGION.*AWS_ROLE_ARN/
    );
  });

  test('lists only the missing env vars in the error', () => {
    process.env.OPENSEARCH_ENDPOINT = 'https://example';
    process.env.AWS_REGION = 'us-east-2';
    // AWS_ROLE_ARN intentionally missing.

    expect(() => createOpenSearch()).toThrow(/AWS_ROLE_ARN/);
    expect(() => createOpenSearch()).not.toThrow(/OPENSEARCH_ENDPOINT/);
  });
});
