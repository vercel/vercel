import {
  DynamoDBClient,
  type DynamoDBClientConfig,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  type TranslateConfig,
} from '@aws-sdk/lib-dynamodb';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';
import { resourceEnv } from './internal/resolve';

/**
 * Options for {@link createDynamoDB}.
 *
 * All fields are optional. With no arguments, the factory finds the connected
 * DynamoDB table by its `<prefix>_DYNAMODB_TABLE_NAME` env var, then reads
 * every other field from env vars under that prefix.
 *
 * Any field on `DynamoDBClientConfig` may also be passed and is forwarded
 * to the underlying client.
 */
export interface CreateDynamoDBOptions extends Partial<DynamoDBClientConfig> {
  /**
   * The env var prefix the Marketplace integration was linked under
   * (e.g. `STORAGE2`). Defaults to autodetect — only required when multiple
   * DynamoDB tables are connected.
   */
  prefix?: string;
  /** Overrides `<prefix>_DYNAMODB_TABLE_NAME`. */
  tableName?: string;
  /** Overrides `<prefix>_AWS_REGION`. */
  region?: string;
  /** Overrides `<prefix>_AWS_ROLE_ARN`. */
  roleArn?: string;
}

/**
 * Options for {@link createDynamoDBDocument}.
 */
export interface CreateDynamoDBDocumentOptions extends CreateDynamoDBOptions {
  /**
   * Marshalling/unmarshalling options forwarded to
   * `DynamoDBDocumentClient.from`.
   */
  translateConfig?: TranslateConfig;
}

/**
 * A `DynamoDBClient` returned by {@link createDynamoDB}, with the connected
 * table's name attached so it can be passed as `TableName` on each command.
 */
export type DynamoDBTableClient = DynamoDBClient & {
  /** The table name, from `<prefix>_DYNAMODB_TABLE_NAME` or `{ tableName }`. */
  readonly tableName: string;
};

/**
 * A `DynamoDBDocumentClient` returned by {@link createDynamoDBDocument}, with
 * the connected table's name attached so it can be passed as `TableName` on
 * each command.
 */
export type DynamoDBDocumentTableClient = DynamoDBDocumentClient & {
  /** The table name, from `<prefix>_DYNAMODB_TABLE_NAME` or `{ tableName }`. */
  readonly tableName: string;
};

function buildDynamoDBClient(
  factory: string,
  opts: CreateDynamoDBOptions
): { client: DynamoDBClient; tableName: string } {
  const env = resourceEnv(
    { factory, service: 'DynamoDB', marker: 'DYNAMODB_TABLE_NAME' },
    opts.prefix
  );

  const tableName = opts.tableName ?? env.require('DYNAMODB_TABLE_NAME');
  const region = opts.region ?? env.require('AWS_REGION');
  const roleArn = opts.roleArn ?? env.require('AWS_ROLE_ARN');

  const { prefix: _p, tableName: _t, region: _r, roleArn: _ra, ...rest } = opts;

  const client = new DynamoDBClient({
    region,
    credentials: awsCredentialsProvider({ roleArn }),
    ...rest,
  });
  return { client, tableName };
}

/**
 * Creates a `DynamoDBClient` pre-configured for a Vercel Marketplace
 * DynamoDB table. The table name is exposed as `client.tableName`.
 *
 * @example
 * ```ts
 * import { createDynamoDB } from '@vercel/aws';
 * import { GetItemCommand } from '@aws-sdk/client-dynamodb';
 *
 * const ddb = createDynamoDB();
 * const result = await ddb.send(
 *   new GetItemCommand({ TableName: ddb.tableName, Key: { id: { S: '1' } } })
 * );
 * ```
 */
export function createDynamoDB(
  opts: CreateDynamoDBOptions = {}
): DynamoDBTableClient {
  const { client, tableName } = buildDynamoDBClient('createDynamoDB', opts);
  return Object.assign(client, { tableName });
}

/**
 * Creates a `DynamoDBDocumentClient` pre-configured for a Vercel Marketplace
 * DynamoDB table. The Document client auto-marshals plain JavaScript values
 * to/from DynamoDB attribute values. The table name is exposed as
 * `client.tableName`.
 *
 * @example
 * ```ts
 * import { createDynamoDBDocument } from '@vercel/aws';
 * import { GetCommand } from '@aws-sdk/lib-dynamodb';
 *
 * const ddb = createDynamoDBDocument();
 * const result = await ddb.send(
 *   new GetCommand({ TableName: ddb.tableName, Key: { id: '1' } })
 * );
 * ```
 */
export function createDynamoDBDocument(
  opts: CreateDynamoDBDocumentOptions = {}
): DynamoDBDocumentTableClient {
  const { translateConfig, ...clientOpts } = opts;
  const { client, tableName } = buildDynamoDBClient(
    'createDynamoDBDocument',
    clientOpts
  );
  return Object.assign(DynamoDBDocumentClient.from(client, translateConfig), {
    tableName,
  });
}
