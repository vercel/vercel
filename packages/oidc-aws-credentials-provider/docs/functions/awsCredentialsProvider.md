[**@vercel/oidc-aws-credentials-provider**](../README.md)

---

# Function: awsCredentialsProvider()

> **awsCredentialsProvider**(`audience`): `AwsCredentialIdentityProvider`

Defined in: [packages/oidc-aws-credentials-provider/src/aws-credentials-provider.ts:76](https://github.com/vercel/vercel/blob/main/packages/oidc-aws-credentials-provider/src/aws-credentials-provider.ts#L76)

Obtains the Vercel OIDC token and creates an AWS credential provider function
that gets AWS credentials by calling STS AssumeRoleWithWebIdentity API.

## Parameters

### audience

[`AwsCredentialsProviderInit`](../interfaces/AwsCredentialsProviderInit.md)

Optional audience to set on the exchanged token.

## Returns

`AwsCredentialIdentityProvider`

A function that provides AWS credentials.

## Example

```js
import * as s3 from '@aws-sdk/client-s3';
import { awsCredentialsProvider } from '@vercel/functions/oidc';

const s3Client = new s3.S3Client({
  credentials: awsCredentialsProvider({
    audience: 'https://sts.amazonaws.com',
    jti: secureRandomString(),
    roleArn: 'arn:aws:iam::1234567890:role/RoleA',
    clientConfig: { region: 'us-west-2' },
    clientPlugins: [addFooHeadersPlugin],
    roleAssumerWithWebIdentity: customRoleAssumer,
    roleSessionName: 'session_123',
    providerId: 'graph.facebook.com',
    policyArns: [{ arn: 'arn:aws:iam::1234567890:policy/SomePolicy' }],
    policy:
      '{"Statement": [{"Effect": "Allow", "Action": "s3:ListBucket", "Resource": "*"}]}',
    durationSeconds: 7200,
  }),
});
```
