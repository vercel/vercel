import {
  DynamoDBClient,
  type DynamoDBClientConfig,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  type TranslateConfig,
} from '@aws-sdk/lib-dynamodb';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';
import { requireEnv, resolvePrefix } from './internal/resolve-prefix';

/**
 * Options for {@link createDynamoDB}.
 *
 * All fields are optional. With no arguments, the factory finds the connected
 * DynamoDB resource by scanning env for a `_AWS_RESOURCE_ARN` starting with
 * `arn:aws:dynamodb:`, then reads every other field from env vars under that
 * prefix.
 *
 * Any field on `DynamoDBClientConfig` may also be passed and is forwarded
 * to the underlying client.
 */
export interface CreateDynamoDBOptions extends Partial<DynamoDBClientConfig> {
  /**
   * The env var prefix the Marketplace integration was linked under
   * (e.g. `STORAGE3`). Defaults to autodetect via the resource ARN.
   */
  prefix?: string;
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

function resolveDynamoConfig(
  factory: string,
  opts: CreateDynamoDBOptions
): { region: string; roleArn: string; rest: Partial<DynamoDBClientConfig> } {
  let prefix = opts.prefix;
  const getPrefix = () =>
    (prefix ??= resolvePrefix({
      factory,
      service: 'DynamoDB',
      arnPrefix: 'arn:aws:dynamodb:',
    }));
  const fromEnv = (suffix: string) => requireEnv(factory, getPrefix(), suffix);

  const region = opts.region ?? fromEnv('AWS_REGION');
  const roleArn = opts.roleArn ?? fromEnv('AWS_ROLE_ARN');

  const { prefix: _p, region: _r, roleArn: _ra, ...rest } = opts;
  return { region, roleArn, rest };
}

/**
 * Creates a `DynamoDBClient` pre-configured for a Vercel Marketplace
 * DynamoDB resource.
 *
 * @example
 * ```ts
 * import { createDynamoDB } from '@vercel/aws';
 * import { GetItemCommand } from '@aws-sdk/client-dynamodb';
 *
 * const ddb = createDynamoDB();
 * const result = await ddb.send(
 *   new GetItemCommand({ TableName: 'users', Key: { id: { S: '1' } } })
 * );
 * ```
 */
export function createDynamoDB(
  opts: CreateDynamoDBOptions = {}
): DynamoDBClient {
  const { region, roleArn, rest } = resolveDynamoConfig('createDynamoDB', opts);
  return new DynamoDBClient({
    region,
    credentials: awsCredentialsProvider({ roleArn }),
    ...rest,
  });
}

/**
 * Creates a `DynamoDBDocumentClient` pre-configured for a Vercel Marketplace
 * DynamoDB resource. The Document client auto-marshals plain JavaScript
 * values to/from DynamoDB attribute values.
 *
 * @example
 * ```ts
 * import { createDynamoDBDocument } from '@vercel/aws';
 * import { GetCommand } from '@aws-sdk/lib-dynamodb';
 *
 * const ddb = createDynamoDBDocument();
 * const result = await ddb.send(
 *   new GetCommand({ TableName: 'users', Key: { id: '1' } })
 * );
 * ```
 */
export function createDynamoDBDocument(
  opts: CreateDynamoDBDocumentOptions = {}
): DynamoDBDocumentClient {
  const { translateConfig, ...clientOpts } = opts;
  return DynamoDBDocumentClient.from(
    createDynamoDB(clientOpts),
    translateConfig
  );
}
