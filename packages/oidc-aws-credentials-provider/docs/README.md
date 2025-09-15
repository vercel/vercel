# @vercel/oidc-aws-credentials-provider

## Table of contents

### Interfaces

- [AwsCredentialsProviderInit](interfaces/AwsCredentialsProviderInit.md)

### Functions

- [awsCredentialsProvider](README.md#awscredentialsprovider)

## Functions

### awsCredentialsProvider

▸ **awsCredentialsProvider**(`init`): `AwsCredentialIdentityProvider`

Obtains the Vercel OIDC token and creates an AWS credential provider function
that gets AWS credentials by calling STS AssumeRoleWithWebIdentity API.

**`Example`**

```js
import * as s3 from '@aws-sdk/client-s3';
import { awsCredentialsProvider } from '@vercel/functions/oidc';

const s3Client = new s3.S3Client({
  credentials: awsCredentialsProvider({
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

#### Parameters

| Name   | Type                                                                     | Description                |
| :----- | :----------------------------------------------------------------------- | :------------------------- |
| `init` | [`AwsCredentialsProviderInit`](interfaces/AwsCredentialsProviderInit.md) | The initialization object. |

#### Returns

`AwsCredentialIdentityProvider`

A function that provides AWS credentials.

#### Defined in

[packages/oidc-aws-credentials-provider/src/aws-credentials-provider.ts:61](https://github.com/vercel/vercel/blob/main/packages/oidc-aws-credentials-provider/src/aws-credentials-provider.ts#L61)
