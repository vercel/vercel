import { Client, type ClientOptions } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';

/**
 * Options for {@link createOpenSearch}.
 *
 * All fields are optional — when omitted, values are read from the
 * environment variables that Vercel injects for an OpenSearch
 * Marketplace resource. Any field on the underlying `ClientOptions`
 * from `@opensearch-project/opensearch` may also be passed and will
 * be forwarded to the `Client`.
 */
export interface CreateOpenSearchOptions extends Partial<ClientOptions> {
  /**
   * The OpenSearch collection endpoint. Defaults to
   * `process.env.OPENSEARCH_ENDPOINT`.
   */
  endpoint?: string;
  /**
   * The AWS region the collection lives in. Defaults to
   * `process.env.AWS_REGION`.
   */
  region?: string;
  /**
   * The IAM role to assume when signing requests. Defaults to
   * `process.env.AWS_ROLE_ARN`, which Vercel sets when the
   * project is connected to an AWS Marketplace resource.
   */
  roleArn?: string;
}

/**
 * Creates an OpenSearch `Client` pre-configured for a Vercel
 * Marketplace OpenSearch Serverless resource.
 *
 * Credentials are obtained via Vercel OIDC + `sts:AssumeRoleWithWebIdentity`.
 * The role, region, and endpoint default to env vars Vercel injects
 * automatically when the project is connected to an OpenSearch resource.
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
  const endpoint = opts.endpoint ?? process.env.OPENSEARCH_ENDPOINT;
  const region = opts.region ?? process.env.AWS_REGION;
  const roleArn = opts.roleArn ?? process.env.AWS_ROLE_ARN;

  const missing: string[] = [];
  if (!endpoint) missing.push('OPENSEARCH_ENDPOINT');
  if (!region) missing.push('AWS_REGION');
  if (!roleArn) missing.push('AWS_ROLE_ARN');
  if (missing.length > 0) {
    throw new Error(
      `createOpenSearch: missing required environment variable${
        missing.length === 1 ? '' : 's'
      } ${missing.join(', ')}. Connect an OpenSearch resource from the Vercel Marketplace, or pass { endpoint, region, roleArn } explicitly.`
    );
  }

  const { endpoint: _e, region: _r, roleArn: _ra, ...rest } = opts;

  return new Client({
    ...AwsSigv4Signer({
      region: region as string,
      service: 'aoss',
      getCredentials: () =>
        awsCredentialsProvider({ roleArn: roleArn as string })(),
    }),
    node: endpoint as string,
    ...rest,
  });
}
