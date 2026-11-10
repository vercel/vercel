import type { AwsCredentialIdentityProvider } from '@smithy/types';
import type { FromWebTokenInit } from '@aws-sdk/credential-provider-web-identity';
import { fromWebToken } from '@aws-sdk/credential-provider-web-identity';
import { getVercelOidcToken } from '@vercel/oidc';

/**
 * The init object for the `awsCredentialsProvider` function.
 *
 * @typedef {Object} AwsCredentialsProviderInit
 * @property {string} audience - Optional audience to set on the exchanged token.
 * @property {string} jti - Optional JTI to set on the exchanged token.
 * @property {boolean} skipTokenCache - Optional flag to bypass the in-memory OIDC token cache. Does not affect STS credential caching.
 * @property {string} roleArn - ARN of the role that the caller is assuming.
 * @property {Object} [clientConfig] - Custom STS client configurations overriding the default ones.
 * @property {Array} [clientPlugins] - Custom STS client middleware plugin to modify the client default behavior.
 * @property {Function} [roleAssumerWithWebIdentity] - A function that assumes a role with web identity and returns a promise fulfilled with credentials for the assumed role.
 * @property {string} [roleSessionName] - An identifier for the assumed role session.
 * @property {string} [providerId] - The fully qualified host component of the domain name of the identity provider.
 * @property {Array} [policyArns] - ARNs of the IAM managed policies that you want to use as managed session policies.
 * @property {string} [policy] - An IAM policy in JSON format that you want to use as an inline session policy.
 * @property {number} [durationSeconds=3600] - The duration, in seconds, of the role session. Defaults to 3600 seconds.
 */
/**
 * The Vercel OIDC token options layered on top of the STS init.
 *
 * `jti` and `skipTokenCache` are only accepted when `audience` is provided,
 * because they only take effect while exchanging the token for a custom
 * audience — without an `audience` there is no exchange.
 */
export type VercelOidcExchangeInit =
  | {
      /**
       * Audience to set on the exchanged token.
       */
      audience: string;
      /**
       * Optional JTI to set on the exchanged token.
       * @default undefined
       */
      jti?: string;
      /**
       * When `true`, bypasses the in-memory OIDC token cache so a fresh token is
       * exchanged on each STS credential refresh. This only affects the Vercel
       * OIDC token — it does not influence how the AWS SDK caches the STS-issued
       * credentials (governed by `durationSeconds`).
       * @default false
       */
      skipTokenCache?: boolean;
    }
  | {
      /**
       * @default undefined
       */
      audience?: undefined;
      jti?: never;
      skipTokenCache?: never;
    };

export type AwsCredentialsProviderInit = Omit<
  FromWebTokenInit,
  'webIdentityToken'
> &
  VercelOidcExchangeInit;

/**
 * Obtains the Vercel OIDC token and creates an AWS credential provider function
 * that gets AWS credentials by calling STS AssumeRoleWithWebIdentity API.
 *
 * @param {AwsCredentialsProviderInit} init - The initialization object.
 * @param {string} init.audience - Optional audience to set on the exchanged token.
 * @param {string} init.jti - Optional JTI to set on the exchanged token.
 * @param {boolean} init.skipTokenCache - Optional flag to bypass the in-memory OIDC token cache. Does not affect STS credential caching.
 * @param {string} init.roleArn - ARN of the role that the caller is assuming.
 * @param {Object} [init.clientConfig] - Custom STS client configurations overriding the default ones.
 * @param {Array} [init.clientPlugins] - Custom STS client middleware plugin to modify the client default behavior.
 * @param {Function} [init.roleAssumerWithWebIdentity] - A function that assumes a role with web identity and returns a promise fulfilled with credentials for the assumed role.
 * @param {string} [init.roleSessionName] - An identifier for the assumed role session.
 * @param {string} [init.providerId] - The fully qualified host component of the domain name of the identity provider.
 * @param {Array} [init.policyArns] - ARNs of the IAM managed policies that you want to use as managed session policies.
 * @param {string} [init.policy] - An IAM policy in JSON format that you want to use as an inline session policy.
 * @param {number} [init.durationSeconds=3600] - The duration, in seconds, of the role session. Defaults to 3600 seconds.
 *
 * @returns {AwsCredentialIdentityProvider} A function that provides AWS credentials.
 *
 * @example
 * ```js
 * import * as s3 from '@aws-sdk/client-s3';
 * import { awsCredentialsProvider } from '@vercel/functions/oidc';
 *
 * const s3Client = new s3.S3Client({
 *   credentials: awsCredentialsProvider({
 *     audience: 'https://sts.amazonaws.com',
 *     jti: secureRandomString(),
 *     roleArn: "arn:aws:iam::1234567890:role/RoleA",
 *     clientConfig: { region: "us-west-2" },
 *     clientPlugins: [addFooHeadersPlugin],
 *     roleAssumerWithWebIdentity: customRoleAssumer,
 *     roleSessionName: "session_123",
 *     providerId: "graph.facebook.com",
 *     policyArns: [{ arn: "arn:aws:iam::1234567890:policy/SomePolicy" }],
 *     policy: "{\"Statement\": [{\"Effect\": \"Allow\", \"Action\": \"s3:ListBucket\", \"Resource\": \"*\"}]}",
 *     durationSeconds: 7200
 *   }),
 * });
 * ```
 */
export function awsCredentialsProvider(
  init: AwsCredentialsProviderInit
): AwsCredentialIdentityProvider {
  const { audience, jti, skipTokenCache, ...initOptions } = init;
  return async () => {
    const webIdentityToken = await getVercelOidcToken(
      audience === undefined
        ? undefined
        : { audience, jti, skipCache: skipTokenCache }
    );
    return fromWebToken({
      ...initOptions,
      webIdentityToken,
    })();
  };
}
