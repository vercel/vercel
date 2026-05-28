import { Client, type ClientOptions } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';
import { requireEnv, resolvePrefix } from './internal/resolve-prefix';

/**
 * Options for {@link createOpenSearch}.
 *
 * All fields are optional. With no arguments, the factory finds the connected
 * OpenSearch resource by scanning env for a `_AWS_RESOURCE_ARN` starting
 * with `arn:aws:aoss:`, then reads every other field from env vars under
 * that prefix.
 *
 * Any field on the underlying `ClientOptions` from
 * `@opensearch-project/opensearch` may also be passed and is forwarded to the
 * `Client`.
 */
export interface CreateOpenSearchOptions extends Partial<ClientOptions> {
  /**
   * The env var prefix the Marketplace integration was linked under
   * (e.g. `STORAGE`, `STORAGE2`, or a custom name). Defaults to autodetect
   * via the resource ARN — only required when multiple OpenSearch resources
   * are connected.
   */
  prefix?: string;
  /** Overrides `<prefix>_OPENSEARCH_DASHBOARD_ENDPOINT`. */
  endpoint?: string;
  /** Overrides `<prefix>_AWS_REGION`. */
  region?: string;
  /** Overrides `<prefix>_AWS_ROLE_ARN`. */
  roleArn?: string;
}

/**
 * Creates an OpenSearch `Client` pre-configured for a Vercel Marketplace
 * OpenSearch resource.
 *
 * Credentials are obtained via Vercel OIDC + `sts:AssumeRoleWithWebIdentity`.
 * Configuration is resolved from the env vars Vercel injects under the
 * resource's link prefix.
 *
 * @example
 * ```ts
 * import { createOpenSearch } from '@vercel/aws';
 *
 * const os = createOpenSearch();
 * await os.search({ index: 'my-index', body: { query: { match_all: {} } } });
 * ```
 */
export function createOpenSearch(opts: CreateOpenSearchOptions = {}): Client {
  const factory = 'createOpenSearch';
  let prefix = opts.prefix;
  const fromEnv = (suffix: string) =>
    requireEnv(
      factory,
      (prefix ??= resolvePrefix({
        factory,
        service: 'OpenSearch',
        arnPrefix: 'arn:aws:aoss:',
      })),
      suffix
    );

  const endpoint = opts.endpoint ?? fromEnv('OPENSEARCH_DASHBOARD_ENDPOINT');
  const region = opts.region ?? fromEnv('AWS_REGION');
  const roleArn = opts.roleArn ?? fromEnv('AWS_ROLE_ARN');

  const { prefix: _p, endpoint: _e, region: _r, roleArn: _ra, ...rest } = opts;

  return new Client({
    ...AwsSigv4Signer({
      region,
      service: 'aoss',
      getCredentials: () => awsCredentialsProvider({ roleArn })(),
    }),
    node: endpoint,
    ...rest,
  });
}
