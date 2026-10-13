import { Client, type ClientOptions } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';
import { resourceEnv } from './internal/resolve';

/**
 * Options for {@link createOpenSearch}.
 *
 * All fields are optional. With no arguments, the factory finds the connected
 * OpenSearch resource by its `<prefix>_OPENSEARCH_ENDPOINT` env var, then
 * reads every other field from env vars under that prefix.
 *
 * Any field on the underlying `ClientOptions` from
 * `@opensearch-project/opensearch` may also be passed and is forwarded to the
 * `Client`.
 */
export interface CreateOpenSearchOptions extends Partial<ClientOptions> {
  /**
   * The env var prefix the Marketplace integration was linked under
   * (e.g. `STORAGE2`). Defaults to autodetect — only required when multiple
   * OpenSearch resources are connected.
   */
  prefix?: string;
  /** Overrides `<prefix>_OPENSEARCH_ENDPOINT`. */
  endpoint?: string;
  /** Overrides `<prefix>_AWS_REGION`. */
  region?: string;
  /** Overrides `<prefix>_AWS_ROLE_ARN`. */
  roleArn?: string;
}

/**
 * Creates an OpenSearch `Client` pre-configured for a Vercel Marketplace
 * OpenSearch Serverless resource.
 *
 * Credentials are obtained via Vercel OIDC + `sts:AssumeRoleWithWebIdentity`.
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
  const env = resourceEnv(
    {
      factory: 'createOpenSearch',
      service: 'OpenSearch',
      marker: 'OPENSEARCH_ENDPOINT',
    },
    opts.prefix
  );

  const endpoint = opts.endpoint ?? env.require('OPENSEARCH_ENDPOINT');
  const region = opts.region ?? env.require('AWS_REGION');
  const roleArn = opts.roleArn ?? env.require('AWS_ROLE_ARN');

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
