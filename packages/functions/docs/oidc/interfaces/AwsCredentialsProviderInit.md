[**@vercel/functions**](../../README.md)

---

# Interface: AwsCredentialsProviderInit

Defined in: [packages/functions/src/oidc/aws-credentials-provider.ts:20](https://github.com/vercel/vercel/blob/main/packages/functions/src/oidc/aws-credentials-provider.ts#L20)

The init object for the `awsCredentialsProvider` function.

## Extends

- [`Omit`](https://www.typescriptlang.org/docs/handbook/utility-types.html#omittype-keys)\<`FromWebTokenInit`, `"webIdentityToken"`\>

## Properties

### clientConfig?

> `optional` **clientConfig**: `any`

Defined in: `node_modules/.pnpm/@aws-sdk+credential-provider-web-identity@3.609.0_@aws-sdk+client-sts@3.806.0/node_modules/@aws-sdk/credential-provider-web-identity/dist-types/fromWebToken.d.ts:135`

Custom STS client configurations overriding the default ones.

#### Inherited from

`Omit.clientConfig`

---

### clientPlugins?

> `optional` **clientPlugins**: `Pluggable`\<`any`, `any`\>[]

Defined in: `node_modules/.pnpm/@aws-sdk+credential-provider-web-identity@3.609.0_@aws-sdk+client-sts@3.806.0/node_modules/@aws-sdk/credential-provider-web-identity/dist-types/fromWebToken.d.ts:139`

Custom STS client middleware plugin to modify the client default behavior.

#### Inherited from

`Omit.clientPlugins`

---

### durationSeconds?

> `optional` **durationSeconds**: `number`

The duration, in seconds, of the role session. Defaults to 3600 seconds.

#### Inherited from

`Omit.durationSeconds`

---

### logger?

> `optional` **logger**: `Logger`

Defined in: node_modules/.pnpm/@aws-sdk+types@3.609.0/node_modules/@aws-sdk/types/dist-types/credentials.d.ts:31

This logger is only used to provide information
on what credential providers were used during resolution.

It does not log credentials.

#### Inherited from

`Omit.logger`

---

### ~~parentClientConfig?~~

> `optional` **parentClientConfig**: `object`

Defined in: node_modules/.pnpm/@aws-sdk+types@3.609.0/node_modules/@aws-sdk/types/dist-types/credentials.d.ts:45

**`Internal`**

Present if the credential provider was created by calling
the defaultCredentialProvider in a client's middleware, having
access to the client's config.

The region of that parent or outer client is important because
an inner client used by the credential provider may need
to match its default partition or region with that of
the outer client.

#### Index Signature

\[`key`: `string`\]: `unknown`

#### ~~region?~~

> `optional` **region**: `string` \| `Provider`\<`string`\>

#### Deprecated

- not truly deprecated, marked as a warning to not use this.

#### Inherited from

`Omit.parentClientConfig`

---

### policy?

> `optional` **policy**: `string`

An IAM policy in JSON format that you want to use as an inline session policy.

#### Inherited from

`Omit.policy`

---

### policyArns?

> `optional` **policyArns**: `object`[]

ARNs of the IAM managed policies that you want to use as managed session policies.

#### arn?

> `optional` **arn**: `string`

#### Inherited from

`Omit.policyArns`

---

### providerId?

> `optional` **providerId**: `string`

The fully qualified host component of the domain name of the identity provider.

#### Inherited from

`Omit.providerId`

---

### roleArn

> **roleArn**: `string`

ARN of the role that the caller is assuming.

#### Inherited from

`Omit.roleArn`

---

### roleAssumerWithWebIdentity()?

> `optional` **roleAssumerWithWebIdentity**: (`params`) => [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`AwsCredentialIdentity`\>

Defined in: `node_modules/.pnpm/@aws-sdk+credential-provider-web-identity@3.609.0_@aws-sdk+client-sts@3.806.0/node_modules/@aws-sdk/credential-provider-web-identity/dist-types/fromWebToken.d.ts:130`

A function that assumes a role with web identity and returns a promise fulfilled with credentials for the assumed role.

#### Parameters

##### params

`AssumeRoleWithWebIdentityParams`

#### Returns

[`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`AwsCredentialIdentity`\>

#### Inherited from

`Omit.roleAssumerWithWebIdentity`

---

### roleSessionName?

> `optional` **roleSessionName**: `string`

Defined in: `node_modules/.pnpm/@aws-sdk+credential-provider-web-identity@3.609.0_@aws-sdk+client-sts@3.806.0/node_modules/@aws-sdk/credential-provider-web-identity/dist-types/fromWebToken.d.ts:123`

An identifier for the assumed role session.

#### Inherited from

`Omit.roleSessionName`
