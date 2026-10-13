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

const configOf = (client: unknown) =>
  (client as { config: Record<string, unknown> }).config;

function linkTable(prefix: string, table: string, region = 'us-east-2') {
  const p = prefix ? `${prefix}_` : '';
  process.env[`${p}AWS_REGION`] = region;
  process.env[`${p}AWS_ROLE_ARN`] = `arn:aws:iam::1:role/${table}`;
  process.env[`${p}DYNAMODB_TABLE_NAME`] = table;
  process.env[`${p}DYNAMODB_TABLE_PARTITION_KEY`] = 'id';
}

const originalEnv = process.env;
beforeEach(() => {
  process.env = {};
  vi.clearAllMocks();
});
afterEach(() => {
  process.env = originalEnv;
});

describe('createDynamoDB', () => {
  test('uses the unprefixed default connection', () => {
    linkTable('', 'users');

    const client = createDynamoDB();
    expect(client.tableName).toBe('users');
    expect(configOf(client).region).toBe('us-east-2');
    expect(awsCredentialsProvider).toHaveBeenCalledWith({
      roleArn: 'arn:aws:iam::1:role/users',
    });
  });

  test('default + STORAGE2: bare call returns default, prefixed returns prefixed', () => {
    linkTable('', 'users');
    linkTable('STORAGE2', 'events', 'eu-west-1');

    expect(createDynamoDB().tableName).toBe('users');
    const second = createDynamoDB({ prefix: 'STORAGE2' });
    expect(second.tableName).toBe('events');
    expect(configOf(second).region).toBe('eu-west-1');
  });

  test('throws when no table is connected', () => {
    expect(() => createDynamoDB()).toThrow(/no DynamoDB resource/);
  });

  test('throws when multiple prefixed tables are connected', () => {
    linkTable('STORAGE', 'users');
    linkTable('STORAGE2', 'events');
    expect(() => createDynamoDB()).toThrow(/multiple DynamoDB resources/);
  });

  test('explicit options bypass env and are not forwarded to the client', () => {
    const client = createDynamoDB({
      tableName: 'explicit',
      region: 'ap-southeast-2',
      roleArn: 'arn:aws:iam::3:role/explicit',
    });
    expect(client.tableName).toBe('explicit');
    expect(configOf(client)).not.toHaveProperty('tableName');
    expect(configOf(client)).not.toHaveProperty('roleArn');
  });
});

describe('createDynamoDBDocument', () => {
  test('wraps the base client and attaches the table name', () => {
    linkTable('STORAGE', 'users');
    const translateConfig = {
      marshallOptions: { removeUndefinedValues: true },
    };

    const doc = createDynamoDBDocument({ translateConfig });

    const [inner, passedTranslate] = (
      DynamoDBDocumentClient.from as unknown as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect(configOf(inner).region).toBe('us-east-2');
    expect(configOf(inner)).not.toHaveProperty('translateConfig');
    expect(passedTranslate).toEqual(translateConfig);
    expect(doc.tableName).toBe('users');
    expect((doc as unknown as { __doc: boolean }).__doc).toBe(true);
  });

  test('names itself in errors', () => {
    expect(() => createDynamoDBDocument()).toThrow(/^createDynamoDBDocument:/);
  });
});
