[**@vercel/aws**](../README.md)

---

# Interface: CreateS3TablesOptions

Defined in: packages/aws/src/s3-tables.ts:18

Options for [createS3Tables](../functions/createS3Tables.md).

All fields are optional. With no arguments, the factory finds the connected
S3 table bucket by its `<prefix>_S3_TABLE_BUCKET_NAME` env var, then reads
every other field from env vars under that prefix.

Any field on `S3TablesClientConfig` may also be passed and is forwarded to
the underlying client.

## Extends

- [`Partial`](https://www.typescriptlang.org/docs/handbook/utility-types.html#partialtype)\<`S3TablesClientConfig`\>

## Properties

### accountId?

> `optional` **accountId?**: `string`

Defined in: packages/aws/src/s3-tables.ts:33

Overrides `<prefix>_AWS_ACCOUNT_ID`.

---

### apiVersion?

> `readonly` `optional` **apiVersion?**: `string`

Defined in: node_modules/.pnpm/@smithy+core@3.35.1/node_modules/@smithy/core/dist-types/submodules/client/smithy-client/client.d.ts:54

**`Internal`**

The API version set internally by the SDK, and is
not planned to be used by customer code.

#### Inherited from

`Partial.apiVersion`

---

### authSchemePreference?

> `optional` **authSchemePreference?**: `string`[] \| `Provider`\<`string`[]\>

Defined in: node_modules/.pnpm/@aws-sdk+client-s3tables@3.1146.0/node_modules/@aws-sdk/client-s3tables/dist-types/auth/httpAuthSchemeProvider.d.ts:38

A comma-separated list of case-sensitive auth scheme names.
An auth scheme name is a fully qualified auth scheme ID with the namespace prefix trimmed.
For example, the auth scheme with ID aws.auth#sigv4 is named sigv4.

#### Inherited from

`Partial.authSchemePreference`

---

### base64Decoder?

> `optional` **base64Decoder?**: `Decoder`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3tables@3.1146.0/node_modules/@aws-sdk/client-s3tables/dist-types/S3TablesClient.d.ts:102

**`Internal`**

The function that will be used to convert a base64-encoded string to a byte array.

#### Inherited from

`Partial.base64Decoder`

---

### base64Encoder?

> `optional` **base64Encoder?**: `Encoder`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3tables@3.1146.0/node_modules/@aws-sdk/client-s3tables/dist-types/S3TablesClient.d.ts:107

**`Internal`**

The function that will be used to convert binary data to a base64-encoded string.

#### Inherited from

`Partial.base64Encoder`

---

### bodyLengthChecker?

> `optional` **bodyLengthChecker?**: `BodyLengthCalculator`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3tables@3.1146.0/node_modules/@aws-sdk/client-s3tables/dist-types/S3TablesClient.d.ts:92

**`Internal`**

A function that can calculate the length of a request body.

#### Inherited from

`Partial.bodyLengthChecker`

---

### cacheMiddleware?

> `optional` **cacheMiddleware?**: `boolean`

Defined in: node_modules/.pnpm/@smithy+core@3.35.1/node_modules/@smithy/core/dist-types/submodules/client/smithy-client/client.d.ts:30

Default false.
When true, the client will only resolve the middleware stack once per
Command class. This means modifying the middlewareStack of the
command or client after requests have been made will not be
recognized.
Calling client.destroy() also clears this cache.
Enable this only if needing the additional time saved (0-1ms per request)
and not needing middleware modifications between requests.

#### Inherited from

`Partial.cacheMiddleware`

---

### ~~credentialDefaultProvider?~~

> `optional` **credentialDefaultProvider?**: (`input`) => `AwsCredentialIdentityProvider`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3tables@3.1146.0/node_modules/@aws-sdk/client-s3tables/dist-types/S3TablesClient.d.ts:173

**`Internal`**

Default credentials provider; Not available in browser runtime.

#### Parameters

##### input

`any`

#### Returns

`AwsCredentialIdentityProvider`

#### Deprecated

#### Inherited from

`Partial.credentialDefaultProvider`

---

### credentials?

> `optional` **credentials?**: `AwsCredentialIdentity` \| `AwsCredentialIdentityProvider`

Defined in: node_modules/.pnpm/@aws-sdk+core@3.978.1/node_modules/@aws-sdk/core/dist-types/submodules/httpAuthSchemes/aws_sdk/resolveAwsSdkSigV4Config.d.ts:11

The credentials used to sign requests.

#### Inherited from

`Partial.credentials`

---

### customUserAgent?

> `optional` **customUserAgent?**: `string` \| `UserAgent`

Defined in: node_modules/.pnpm/@aws-sdk+core@3.978.1/node_modules/@aws-sdk/core/dist-types/submodules/client/middleware-user-agent/configurations.d.ts:13

The custom user agent header that would be appended to default one

#### Inherited from

`Partial.customUserAgent`

---

### defaultsMode?

> `optional` **defaultsMode?**: `DefaultsMode` \| `Provider`\<`DefaultsMode`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-s3tables@3.1146.0/node_modules/@aws-sdk/client-s3tables/dist-types/S3TablesClient.d.ts:195

The @smithy/smithy-client#DefaultsMode that will be used to determine how certain default configuration options are resolved in the SDK.

#### Inherited from

`Partial.defaultsMode`

---

### defaultUserAgentProvider?

> `optional` **defaultUserAgentProvider?**: `Provider`\<`UserAgent`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-s3tables@3.1146.0/node_modules/@aws-sdk/client-s3tables/dist-types/S3TablesClient.d.ts:167

**`Internal`**

The provider populating default tracking information to be sent with `user-agent`, `x-amz-user-agent` header

#### Inherited from

`Partial.defaultUserAgentProvider`

---

### disableClockSkewCorrection?

> `optional` **disableClockSkewCorrection?**: `boolean` \| `Provider`\<`boolean`\>

Defined in: node_modules/.pnpm/@aws-sdk+core@3.978.1/node_modules/@aws-sdk/core/dist-types/submodules/httpAuthSchemes/aws_sdk/resolveAwsSdkSigV4Config.d.ts:43

Whether to disable clock skew correction. When true, the SDK will not adjust
the signing timestamp, will not update the client clock offset from response
headers, and will not retry clock skew errors.

Defaults to false (correction enabled).

#### Inherited from

`Partial.disableClockSkewCorrection`

---

### disableHostPrefix?

> `optional` **disableHostPrefix?**: `boolean`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3tables@3.1146.0/node_modules/@aws-sdk/client-s3tables/dist-types/S3TablesClient.d.ts:127

Disable dynamically changing the endpoint of the client based on the hostPrefix
trait of an operation.

#### Inherited from

`Partial.disableHostPrefix`

---

### endpoint?

> `optional` **endpoint?**: (string \| Endpoint \| Provider\<Endpoint\> \| EndpointV2 \| Provider\<EndpointV2\>) & (string \| Provider\<string\> \| Endpoint \| Provider\<...\> \| EndpointV2 \| Provider\<...\>)

Defined in: node_modules/.pnpm/@smithy+core@3.35.1/node_modules/@smithy/core/dist-types/submodules/endpoints/middleware-endpoint/resolveEndpointConfig.d.ts:18

The fully qualified endpoint of the webservice. This is only for using
a custom endpoint (for example, when using a local version of S3).

Endpoint transformations such as S3 applying a bucket to the hostname are
still applicable to this custom endpoint.

#### Inherited from

`Partial.endpoint`

---

### endpointProvider?

> `optional` **endpointProvider?**: (`params`, `context?`) => `EndpointV2`

Defined in: node_modules/.pnpm/@smithy+core@3.35.1/node_modules/@smithy/core/dist-types/submodules/endpoints/middleware-endpoint/resolveEndpointConfig.d.ts:24

Providing a custom endpointProvider will override
built-in transformations of the endpoint such as S3 adding the bucket
name to the hostname, since they are part of the default endpointProvider.

#### Parameters

##### params

`EndpointParameters`

##### context?

###### logger?

`Logger`

#### Returns

`EndpointV2`

#### Inherited from

`Partial.endpointProvider`

---

### extensions?

> `optional` **extensions?**: `RuntimeExtension`[]

Defined in: node_modules/.pnpm/@aws-sdk+client-s3tables@3.1146.0/node_modules/@aws-sdk/client-s3tables/dist-types/S3TablesClient.d.ts:191

Optional extensions

#### Inherited from

`Partial.extensions`

---

### httpAuthSchemeProvider?

> `optional` **httpAuthSchemeProvider?**: `S3TablesHttpAuthSchemeProvider`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3tables@3.1146.0/node_modules/@aws-sdk/client-s3tables/dist-types/auth/httpAuthSchemeProvider.d.ts:48

**`Internal`**

Configuration of an HttpAuthSchemeProvider for a client which resolves which HttpAuthScheme to use.

#### Inherited from

`Partial.httpAuthSchemeProvider`

---

### httpAuthSchemes?

> `optional` **httpAuthSchemes?**: `HttpAuthScheme`[]

Defined in: node_modules/.pnpm/@aws-sdk+client-s3tables@3.1146.0/node_modules/@aws-sdk/client-s3tables/dist-types/auth/httpAuthSchemeProvider.d.ts:43

**`Internal`**

Configuration of HttpAuthSchemes for a client which provides default identity providers and signers per auth scheme.

#### Inherited from

`Partial.httpAuthSchemes`

---

### ignoreConfiguredEndpointUrls?

> `optional` **ignoreConfiguredEndpointUrls?**: `boolean`

Defined in: node_modules/.pnpm/@smithy+core@3.35.1/node_modules/@smithy/core/dist-types/submodules/endpoints/middleware-endpoint/resolveEndpointConfig.d.ts:47

When true, endpoint URLs from environment variables and the shared
configuration file are not used. Does not affect endpoints set
via code (e.g. client constructor endpoint option).

Default false.

#### Inherited from

`Partial.ignoreConfiguredEndpointUrls`

---

### logger?

> `optional` **logger?**: `Logger`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3tables@3.1146.0/node_modules/@aws-sdk/client-s3tables/dist-types/S3TablesClient.d.ts:187

Optional logger for logging debug/info/warn/error.

#### Inherited from

`Partial.logger`

---

### maxAttempts?

> `optional` **maxAttempts?**: `number` \| `Provider`\<`number`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-s3tables@3.1146.0/node_modules/@aws-sdk/client-s3tables/dist-types/S3TablesClient.d.ts:177

Value for how many times a request will be made at most in case of retry.

#### Inherited from

`Partial.maxAttempts`

---

### prefix?

> `optional` **prefix?**: `string`

Defined in: packages/aws/src/s3-tables.ts:24

The env var prefix the Marketplace integration was linked under
(e.g. `STORAGE2`). Defaults to autodetect — only required when multiple
S3 table buckets are connected.

---

### profile?

> `optional` **profile?**: `string`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3tables@3.1146.0/node_modules/@aws-sdk/client-s3tables/dist-types/S3TablesClient.d.ts:162

Setting a client profile is similar to setting a value for the
AWS_PROFILE environment variable. Setting a profile on a client
in code only affects the single client instance, unlike AWS_PROFILE.

When set, and only for environments where an AWS configuration
file exists, fields configurable by this file will be retrieved
from the specified profile within that file.
Conflicting code configuration and environment variables will
still have higher priority.

For client credential resolution that involves checking the AWS
configuration file, the client's profile (this value) will be
used unless a different profile is set in the credential
provider options.

#### Inherited from

`Partial.profile`

---

### protocol?

> `optional` **protocol?**: `ClientProtocol`\<`any`, `any`\> \| `$ClientProtocol`\<`any`, `any`\> \| `ClientProtocolCtor`\<`any`, `any`\> \| `$ClientProtocolCtor`\<`any`, `any`\>

Defined in: node_modules/.pnpm/@smithy+core@3.35.1/node_modules/@smithy/core/dist-types/submodules/client/smithy-client/client.d.ts:39

A client request/response protocol or constructor of one.
A protocol in this context is not e.g. https.
It is the combined implementation of how to (de)serialize and create
the messages (e.g. http requests/responses) that are being exchanged.

#### Inherited from

`Partial.protocol`

---

### protocolSettings?

> `optional` **protocolSettings?**: `object`

Defined in: node_modules/.pnpm/@smithy+core@3.35.1/node_modules/@smithy/core/dist-types/submodules/client/smithy-client/client.d.ts:45

**`Internal`**

These are automatically generated and will be passed to the
config.protocol if given as a constructor.

#### Index Signature

\[`setting`: `string`\]: `unknown`

#### defaultNamespace?

> `optional` **defaultNamespace?**: `string`

#### Inherited from

`Partial.protocolSettings`

---

### region?

> `optional` **region?**: `string`

Defined in: packages/aws/src/s3-tables.ts:35

Overrides `<prefix>_AWS_REGION`.

#### Overrides

`Partial.region`

---

### requestHandler?

> `optional` **requestHandler?**: (NodeHttpHandlerOptions \| FetchHttpHandlerOptions \| Record\<string, unknown\> \| RequestHandler\<any, any, HttpHandlerOptions\>) & HttpHandlerUserInput

Defined in: node_modules/.pnpm/@smithy+core@3.35.1/node_modules/@smithy/core/dist-types/submodules/client/smithy-client/client.d.ts:17

#### Inherited from

`Partial.requestHandler`

---

### retryMode?

> `optional` **retryMode?**: `string` \| `Provider`\<`string`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-s3tables@3.1146.0/node_modules/@aws-sdk/client-s3tables/dist-types/S3TablesClient.d.ts:183

Specifies which retry algorithm to use.

#### See

https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-smithy-util-retry/Enum/RETRY_MODES/

#### Inherited from

`Partial.retryMode`

---

### retryStrategy?

> `optional` **retryStrategy?**: `RetryStrategy` \| `RetryStrategyV2`

Defined in: node_modules/.pnpm/@smithy+core@3.35.1/node_modules/@smithy/core/dist-types/submodules/retry/middleware-retry/configurations.d.ts:26

The strategy to retry the request. Using built-in exponential backoff strategy by default.

#### Inherited from

`Partial.retryStrategy`

---

### roleArn?

> `optional` **roleArn?**: `string`

Defined in: packages/aws/src/s3-tables.ts:37

Overrides `<prefix>_AWS_ROLE_ARN`.

---

### runtime?

> `optional` **runtime?**: `string`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3tables@3.1146.0/node_modules/@aws-sdk/client-s3tables/dist-types/S3TablesClient.d.ts:122

**`Internal`**

The runtime environment.

#### Inherited from

`Partial.runtime`

---

### serviceConfiguredEndpoint?

> `optional` **serviceConfiguredEndpoint?**: `undefined`

Defined in: node_modules/.pnpm/@smithy+core@3.35.1/node_modules/@smithy/core/dist-types/submodules/endpoints/middleware-endpoint/resolveEndpointConfig.d.ts:53

**`Internal`**

This field is used internally so you should not fill any value to this field.

#### Inherited from

`Partial.serviceConfiguredEndpoint`

---

### serviceId?

> `optional` **serviceId?**: `string`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3tables@3.1146.0/node_modules/@aws-sdk/client-s3tables/dist-types/S3TablesClient.d.ts:132

**`Internal`**

Unique service identifier.

#### Inherited from

`Partial.serviceId`

---

### sha256?

> `optional` **sha256?**: `ChecksumConstructor` \| `HashConstructor`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3tables@3.1146.0/node_modules/@aws-sdk/client-s3tables/dist-types/S3TablesClient.d.ts:82

**`Internal`**

A constructor for a class implementing the @smithy/types#ChecksumConstructor interface
that computes the SHA-256 HMAC or checksum of a string or binary buffer.

#### Inherited from

`Partial.sha256`

---

### signer?

> `optional` **signer?**: `RequestSigner` \| ((`authScheme?`) => [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`RequestSigner`\>)

Defined in: node_modules/.pnpm/@aws-sdk+core@3.978.1/node_modules/@aws-sdk/core/dist-types/submodules/httpAuthSchemes/aws_sdk/resolveAwsSdkSigV4Config.d.ts:15

The signer to use when signing requests.

#### Inherited from

`Partial.signer`

---

### signerConstructor?

> `optional` **signerConstructor?**: (`options`) => `RequestSigner`

Defined in: node_modules/.pnpm/@aws-sdk+core@3.978.1/node_modules/@aws-sdk/core/dist-types/submodules/httpAuthSchemes/aws_sdk/resolveAwsSdkSigV4Config.d.ts:35

**`Internal`**

The injectable SigV4-compatible signer class constructor. If not supplied,
regular SignatureV4 constructor will be used.

#### Parameters

##### options

`SignatureV4Init` & `SignatureV4CryptoInit`

#### Returns

`RequestSigner`

#### Inherited from

`Partial.signerConstructor`

---

### signingEscapePath?

> `optional` **signingEscapePath?**: `boolean`

Defined in: node_modules/.pnpm/@aws-sdk+core@3.978.1/node_modules/@aws-sdk/core/dist-types/submodules/httpAuthSchemes/aws_sdk/resolveAwsSdkSigV4Config.d.ts:19

Whether to escape request path when signing the request.

#### Inherited from

`Partial.signingEscapePath`

---

### signingRegion?

> `optional` **signingRegion?**: `string`

Defined in: node_modules/.pnpm/@aws-sdk+core@3.978.1/node_modules/@aws-sdk/core/dist-types/submodules/httpAuthSchemes/aws_sdk/resolveAwsSdkSigV4Config.d.ts:28

The region where you want to sign your request against. This
can be different to the region in the endpoint.

#### Inherited from

`Partial.signingRegion`

---

### streamCollector?

> `optional` **streamCollector?**: `StreamCollector`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3tables@3.1146.0/node_modules/@aws-sdk/client-s3tables/dist-types/S3TablesClient.d.ts:97

**`Internal`**

A function that converts a stream into an array of bytes.

#### Inherited from

`Partial.streamCollector`

---

### systemClockOffset?

> `optional` **systemClockOffset?**: `number`

Defined in: node_modules/.pnpm/@aws-sdk+core@3.978.1/node_modules/@aws-sdk/core/dist-types/submodules/httpAuthSchemes/aws_sdk/resolveAwsSdkSigV4Config.d.ts:23

An offset value in milliseconds to apply to all signing times.

#### Inherited from

`Partial.systemClockOffset`

---

### tableBucketARN?

> `optional` **tableBucketARN?**: `string`

Defined in: packages/aws/src/s3-tables.ts:31

Overrides the table bucket ARN, which is otherwise built from the bucket
name, region, and `<prefix>_AWS_ACCOUNT_ID`.

---

### tableBucketName?

> `optional` **tableBucketName?**: `string`

Defined in: packages/aws/src/s3-tables.ts:26

Overrides `<prefix>_S3_TABLE_BUCKET_NAME`.

---

### ~~tls?~~

> `optional` **tls?**: `boolean`

Defined in: node_modules/.pnpm/@smithy+core@3.35.1/node_modules/@smithy/core/dist-types/submodules/endpoints/middleware-endpoint/resolveEndpointConfig.d.ts:31

Whether TLS is enabled for requests.

#### Deprecated

#### Inherited from

`Partial.tls`

---

### urlParser?

> `optional` **urlParser?**: `UrlParser`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3tables@3.1146.0/node_modules/@aws-sdk/client-s3tables/dist-types/S3TablesClient.d.ts:87

**`Internal`**

The function that will be used to convert strings into HTTP endpoints.

#### Inherited from

`Partial.urlParser`

---

### useDualstackEndpoint?

> `optional` **useDualstackEndpoint?**: (boolean \| Provider\<boolean\>) & (boolean \| Provider\<boolean \| undefined\>)

Defined in: node_modules/.pnpm/@aws-sdk+client-s3tables@3.1146.0/node_modules/@aws-sdk/client-s3tables/dist-types/S3TablesClient.d.ts:136

Enables IPv6/IPv4 dualstack endpoint.

#### Inherited from

`Partial.useDualstackEndpoint`

---

### useFipsEndpoint?

> `optional` **useFipsEndpoint?**: (boolean \| Provider\<boolean\>) & (boolean \| Provider\<boolean \| undefined\>)

Defined in: node_modules/.pnpm/@aws-sdk+client-s3tables@3.1146.0/node_modules/@aws-sdk/client-s3tables/dist-types/S3TablesClient.d.ts:140

Enables FIPS compatible endpoints.

#### Inherited from

`Partial.useFipsEndpoint`

---

### userAgentAppId?

> `optional` **userAgentAppId?**: `string` \| `Provider`\<`string` \| `undefined`\>

Defined in: node_modules/.pnpm/@aws-sdk+core@3.978.1/node_modules/@aws-sdk/core/dist-types/submodules/client/middleware-user-agent/configurations.d.ts:17

The application ID used to identify the application.

#### Inherited from

`Partial.userAgentAppId`

---

### utf8Decoder?

> `optional` **utf8Decoder?**: `Decoder`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3tables@3.1146.0/node_modules/@aws-sdk/client-s3tables/dist-types/S3TablesClient.d.ts:112

**`Internal`**

The function that will be used to convert a UTF8-encoded string to a byte array.

#### Inherited from

`Partial.utf8Decoder`

---

### utf8Encoder?

> `optional` **utf8Encoder?**: `Encoder`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3tables@3.1146.0/node_modules/@aws-sdk/client-s3tables/dist-types/S3TablesClient.d.ts:117

**`Internal`**

The function that will be used to convert binary data to a UTF-8 encoded string.

#### Inherited from

`Partial.utf8Encoder`
