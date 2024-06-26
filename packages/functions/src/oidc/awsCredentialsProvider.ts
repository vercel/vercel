import type { AwsCredentialIdentityProvider } from '@smithy/types';
import type { FromWebTokenInit } from '@aws-sdk/credential-provider-web-identity';
import { getVercelOidcToken } from './getVercelOidcToken';

/**
 * The init object for the `awsCredentialsProvider` function.
 */
export type AwsCredentialsProviderInit = Omit<
  FromWebTokenInit,
  'webIdentityToken'
>;

/**
 * Obtains the Vercel OIDC token and creates an AWS credential provider function
 * that gets AWS credentials by calling STS AssumeRoleWithWebIdentity API.
 *
 * @example
 *
 * ```javascript
 * import * as s3 from '@aws-sdk/client-s3';
 * import { awsCredentialsProvider } from '@vercel/functions/oidc';
 *
 * const s3Client = new s3.S3Client({
 *   credentials: awsCredentialsProvider({
 *     // Required. ARN of the role that the caller is assuming.
 *     roleArn: "arn:aws:iam::1234567890:role/RoleA",
 *     // Optional. Custom STS client configurations overriding the default ones.
 *     clientConfig: { region }
 *     // Optional. Custom STS client middleware plugin to modify the client default behavior.
 *     // e.g. adding custom headers.
 *     clientPlugins: [addFooHeadersPlugin],
 *     // Optional. A function that assumes a role with web identity and returns a promise fulfilled with credentials for
 *     // the assumed role.
 *     roleAssumerWithWebIdentity,
 *     // Optional. An identifier for the assumed role session.
 *     roleSessionName: "session_123",
 *     // Optional. The fully qualified host component of the domain name of the identity provider.
 *     providerId: "graph.facebook.com",
 *     // Optional. ARNs of the IAM managed policies that you want to use as managed session.
 *     policyArns: [{arn: "arn:aws:iam::1234567890:policy/SomePolicy"}],
 *     // Optional. An IAM policy in JSON format that you want to use as an inline session policy.
 *     policy: "JSON_STRING",
 *     // Optional. The duration, in seconds, of the role session. Default to 3600.
 *     durationSeconds: 7200
 *   }),
 * });
 * ```
 */
export function awsCredentialsProvider(
  init: AwsCredentialsProviderInit
): AwsCredentialIdentityProvider {
  return async () => {
    const { fromWebToken } = await import(
      '@aws-sdk/credential-provider-web-identity'
    );
    return fromWebToken({
      ...init,
      webIdentityToken: await getVercelOidcToken(),
    })();
  };
}
