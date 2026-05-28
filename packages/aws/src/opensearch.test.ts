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

const KEYS = [
  'STORAGE_AWS_RESOURCE_ARN',
  'STORAGE_OPENSEARCH_DASHBOARD_ENDPOINT',
  'STORAGE_AWS_REGION',
  'STORAGE_AWS_ROLE_ARN',
  'STORAGE2_AWS_RESOURCE_ARN',
  'STORAGE2_OPENSEARCH_DASHBOARD_ENDPOINT',
  'STORAGE2_AWS_REGION',
  'STORAGE2_AWS_ROLE_ARN',
];

describe('createOpenSearch', () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) {
      original[k] = process.env[k];
      delete process.env[k];
    }
    vi.clearAllMocks();
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  });

  test('autodetects the prefix from the resource ARN', async () => {
    process.env.STORAGE_AWS_RESOURCE_ARN =
      'arn:aws:aoss:us-east-2:1:collection/abc';
    process.env.STORAGE_OPENSEARCH_DASHBOARD_ENDPOINT =
      'https://example.aoss.amazonaws.com';
    process.env.STORAGE_AWS_REGION = 'us-east-2';
    process.env.STORAGE_AWS_ROLE_ARN = 'arn:aws:iam::1:role/vercel-opensearch';

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

    await signerArgs.getCredentials();
    expect(awsCredentialsProvider).toHaveBeenCalledWith({
      roleArn: 'arn:aws:iam::1:role/vercel-opensearch',
    });

    expect(
      (client as unknown as { options: { node: string } }).options.node
    ).toBe('https://example.aoss.amazonaws.com');
  });

  test('uses an explicit prefix override', () => {
    process.env.STORAGE_AWS_RESOURCE_ARN =
      'arn:aws:aoss:us-east-2:1:collection/one';
    process.env.STORAGE_OPENSEARCH_DASHBOARD_ENDPOINT = 'https://one.example';
    process.env.STORAGE_AWS_REGION = 'us-east-2';
    process.env.STORAGE_AWS_ROLE_ARN = 'arn:aws:iam::1:role/one';

    process.env.STORAGE2_AWS_RESOURCE_ARN =
      'arn:aws:aoss:us-east-2:1:collection/two';
    process.env.STORAGE2_OPENSEARCH_DASHBOARD_ENDPOINT = 'https://two.example';
    process.env.STORAGE2_AWS_REGION = 'eu-west-1';
    process.env.STORAGE2_AWS_ROLE_ARN = 'arn:aws:iam::2:role/two';

    const client = createOpenSearch({ prefix: 'STORAGE2' });
    const signerArgs = (AwsSigv4Signer as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0][0] as { region: string };
    expect(signerArgs.region).toBe('eu-west-1');
    expect(
      (client as unknown as { options: { node: string } }).options.node
    ).toBe('https://two.example');
  });

  test('explicit fields override env entirely', () => {
    createOpenSearch({
      endpoint: 'https://override.example',
      region: 'eu-west-2',
      roleArn: 'arn:aws:iam::3:role/override',
    });
    const signerArgs = (AwsSigv4Signer as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0][0] as { region: string };
    expect(signerArgs.region).toBe('eu-west-2');
  });

  test('throws when no resource is connected', () => {
    expect(() => createOpenSearch()).toThrow(/no OpenSearch resource/);
  });

  test('throws when multiple resources are connected without a prefix', () => {
    process.env.STORAGE_AWS_RESOURCE_ARN =
      'arn:aws:aoss:us-east-2:1:collection/one';
    process.env.STORAGE2_AWS_RESOURCE_ARN =
      'arn:aws:aoss:us-east-2:1:collection/two';
    expect(() => createOpenSearch()).toThrow(/multiple OpenSearch resources/);
  });
});
