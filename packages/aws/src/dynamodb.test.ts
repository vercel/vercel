import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@aws-sdk/client-dynamodb', () => {
  class DynamoDBClient {
    public config: unknown;
    constructor(config: unknown) {
      this.config = config;
    }
  }
  return { DynamoDBClient };
});

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn((client: unknown, translateConfig: unknown) => ({
      __doc: true,
      client,
      translateConfig,
    })),
  },
}));

vi.mock('@vercel/oidc-aws-credentials-provider', () => ({
  awsCredentialsProvider: vi.fn(() => async () => ({
    accessKeyId: 'AKIA_TEST',
    secretAccessKey: 'SECRET_TEST',
  })),
}));

import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';
import { createDynamoDB, createDynamoDBDocument } from './dynamodb';

const KEYS = [
  'AWS_RESOURCE_ARN',
  'AWS_REGION',
  'AWS_ROLE_ARN',
  'STORAGE_AWS_RESOURCE_ARN',
  'STORAGE_AWS_REGION',
  'STORAGE_AWS_ROLE_ARN',
  'STORAGE2_AWS_RESOURCE_ARN',
  'STORAGE2_AWS_REGION',
  'STORAGE2_AWS_ROLE_ARN',
];

describe('createDynamoDB', () => {
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

  test('autodetects the prefix and builds a client', () => {
    process.env.STORAGE_AWS_RESOURCE_ARN =
      'arn:aws:dynamodb:us-east-2:1:table/users';
    process.env.STORAGE_AWS_REGION = 'us-east-2';
    process.env.STORAGE_AWS_ROLE_ARN = 'arn:aws:iam::1:role/vercel-ddb';

    const client = createDynamoDB();
    const config = (client as unknown as { config: Record<string, unknown> })
      .config;

    expect(config.region).toBe('us-east-2');
    expect(awsCredentialsProvider).toHaveBeenCalledWith({
      roleArn: 'arn:aws:iam::1:role/vercel-ddb',
    });
  });

  test('passes prefix to override autodetect', () => {
    process.env.STORAGE_AWS_RESOURCE_ARN =
      'arn:aws:dynamodb:us-east-2:1:table/one';
    process.env.STORAGE_AWS_REGION = 'us-east-2';
    process.env.STORAGE_AWS_ROLE_ARN = 'arn:aws:iam::1:role/one';

    process.env.STORAGE2_AWS_RESOURCE_ARN =
      'arn:aws:dynamodb:eu-west-1:1:table/two';
    process.env['STORAGE2_AWS_REGION'] = 'eu-west-1';
    process.env['STORAGE2_AWS_ROLE_ARN'] = 'arn:aws:iam::2:role/two';

    const client = createDynamoDB({ prefix: 'STORAGE2' });
    const config = (client as unknown as { config: Record<string, unknown> })
      .config;
    expect(config.region).toBe('eu-west-1');
  });

  test('throws when no resource is connected', () => {
    expect(() => createDynamoDB()).toThrow(/no DynamoDB resource/);
  });

  test('throws when multiple resources are connected without a prefix', () => {
    process.env.STORAGE_AWS_RESOURCE_ARN =
      'arn:aws:dynamodb:us-east-2:1:table/one';
    process.env.STORAGE2_AWS_RESOURCE_ARN =
      'arn:aws:dynamodb:us-east-2:1:table/two';
    expect(() => createDynamoDB()).toThrow(/multiple DynamoDB resources/);
  });

  test('autodetects an unprefixed default connection', () => {
    process.env.AWS_RESOURCE_ARN = 'arn:aws:dynamodb:us-east-2:1:table/default';
    process.env.AWS_REGION = 'us-east-2';
    process.env.AWS_ROLE_ARN = 'arn:aws:iam::1:role/default';

    const client = createDynamoDB();
    const config = (client as unknown as { config: Record<string, unknown> })
      .config;
    expect(config.region).toBe('us-east-2');
    expect(awsCredentialsProvider).toHaveBeenCalledWith({
      roleArn: 'arn:aws:iam::1:role/default',
    });
  });

  test('default + STORAGE2: bare call returns default, prefixed returns prefixed', () => {
    process.env.AWS_RESOURCE_ARN = 'arn:aws:dynamodb:us-east-2:1:table/default';
    process.env.AWS_REGION = 'us-east-2';
    process.env.AWS_ROLE_ARN = 'arn:aws:iam::1:role/default';

    process.env.STORAGE2_AWS_RESOURCE_ARN =
      'arn:aws:dynamodb:eu-west-1:1:table/second';
    process.env.STORAGE2_AWS_REGION = 'eu-west-1';
    process.env.STORAGE2_AWS_ROLE_ARN = 'arn:aws:iam::2:role/second';

    const a = createDynamoDB();
    const b = createDynamoDB({ prefix: 'STORAGE2' });

    expect((a as unknown as { config: { region: string } }).config.region).toBe(
      'us-east-2'
    );
    expect((b as unknown as { config: { region: string } }).config.region).toBe(
      'eu-west-1'
    );
  });
});

describe('createDynamoDBDocument', () => {
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

  test('wraps the base client via DynamoDBDocumentClient.from', () => {
    process.env.STORAGE_AWS_RESOURCE_ARN =
      'arn:aws:dynamodb:us-east-2:1:table/users';
    process.env.STORAGE_AWS_REGION = 'us-east-2';
    process.env.STORAGE_AWS_ROLE_ARN = 'arn:aws:iam::1:role/vercel-ddb';

    const translateConfig = {
      marshallOptions: { removeUndefinedValues: true },
    };
    const doc = createDynamoDBDocument({ translateConfig });

    expect(DynamoDBDocumentClient.from).toHaveBeenCalledTimes(1);
    const [innerClient, passedTranslate] = (
      DynamoDBDocumentClient.from as unknown as ReturnType<typeof vi.fn>
    ).mock.calls[0];

    expect(
      (innerClient as { config: Record<string, unknown> }).config.region
    ).toBe('us-east-2');
    expect(passedTranslate).toEqual(translateConfig);
    expect((doc as unknown as { __doc: boolean }).__doc).toBe(true);
  });
});
