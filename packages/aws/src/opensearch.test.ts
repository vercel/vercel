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

type SignerArgs = {
  region: string;
  service: string;
  getCredentials: () => Promise<unknown>;
};

const signerArgs = (call = 0) =>
  (AwsSigv4Signer as unknown as ReturnType<typeof vi.fn>).mock.calls[
    call
  ][0] as SignerArgs;
const nodeOf = (client: unknown) =>
  (client as { options: { node: string } }).options.node;

describe('createOpenSearch', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {};
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('uses the unprefixed default connection', async () => {
    process.env.OPENSEARCH_ENDPOINT = 'https://example.aoss.amazonaws.com';
    process.env.AWS_REGION = 'us-east-2';
    process.env.AWS_ROLE_ARN = 'arn:aws:iam::1:role/vercel-opensearch';

    const client = createOpenSearch();

    expect(signerArgs().region).toBe('us-east-2');
    expect(signerArgs().service).toBe('aoss');
    expect(nodeOf(client)).toBe('https://example.aoss.amazonaws.com');

    await signerArgs().getCredentials();
    expect(awsCredentialsProvider).toHaveBeenCalledWith({
      roleArn: 'arn:aws:iam::1:role/vercel-opensearch',
    });
  });

  test('autodetects a prefixed connection', () => {
    process.env.STORAGE_OPENSEARCH_ENDPOINT = 'https://prefixed.example';
    process.env.STORAGE_AWS_REGION = 'eu-west-1';
    process.env.STORAGE_AWS_ROLE_ARN = 'arn:aws:iam::1:role/prefixed';

    const client = createOpenSearch();
    expect(signerArgs().region).toBe('eu-west-1');
    expect(nodeOf(client)).toBe('https://prefixed.example');
  });

  test('passes prefix to pick between connections', () => {
    process.env.STORAGE_OPENSEARCH_ENDPOINT = 'https://one.example';
    process.env.STORAGE_AWS_REGION = 'us-east-2';
    process.env.STORAGE_AWS_ROLE_ARN = 'arn:aws:iam::1:role/one';
    process.env.STORAGE2_OPENSEARCH_ENDPOINT = 'https://two.example';
    process.env.STORAGE2_AWS_REGION = 'eu-west-1';
    process.env.STORAGE2_AWS_ROLE_ARN = 'arn:aws:iam::2:role/two';

    expect(() => createOpenSearch()).toThrow(/multiple OpenSearch resources/);
    const client = createOpenSearch({ prefix: 'STORAGE2' });
    expect(nodeOf(client)).toBe('https://two.example');
  });

  test('explicit options bypass env entirely', () => {
    createOpenSearch({
      endpoint: 'https://override.example',
      region: 'eu-west-1',
      roleArn: 'arn:aws:iam::2:role/override',
    });

    expect(signerArgs().region).toBe('eu-west-1');
    expect(awsCredentialsProvider).not.toHaveBeenCalled();
  });

  test('throws when no resource is connected', () => {
    expect(() => createOpenSearch()).toThrow(/no OpenSearch resource/);
  });

  test('throws while the collection is provisioning', () => {
    process.env.OPENSEARCH_ENDPOINT = 'provisioning';
    process.env.AWS_REGION = 'us-east-2';
    process.env.AWS_ROLE_ARN = 'arn:aws:iam::1:role/os';

    expect(() => createOpenSearch()).toThrow(
      /OPENSEARCH_ENDPOINT is "provisioning"/
    );
  });
});
