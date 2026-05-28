[**@vercel/aws**](../README.md)

---

# Interface: CreateDynamoDBOptions

Defined in: [packages/aws/src/dynamodb.ts:23](https://github.com/vercel/vercel/blob/main/packages/aws/src/dynamodb.ts#L23)

Options for [createDynamoDB](../functions/createDynamoDB.md).

All fields are optional. With no arguments, the factory finds the connected
DynamoDB resource by scanning env for a `_AWS_RESOURCE_ARN` starting with
`arn:aws:dynamodb:`, then reads every other field from env vars under that
prefix.

Any field on `DynamoDBClientConfig` may also be passed and is forwarded
to the underlying client.

## Extends

- [`Partial`](https://www.typescriptlang.org/docs/handbook/utility-types.html#partialtype)\<`DynamoDBClientConfig`\>

## Extended by

- [`CreateDynamoDBDocumentOptions`](CreateDynamoDBDocumentOptions.md)

## Properties

### accountId?

> `optional` **accountId?**: `string` \| `Provider`\<`string`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/endpoint/EndpointParameters.d.ts:10

#### Inherited from

`Partial.accountId`

---

### accountIdEndpointMode?

> `optional` **accountIdEndpointMode?**: (AccountIdEndpointMode \| Provider\<AccountIdEndpointMode\>) & (string \| Provider\<string\>)

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:159

Defines if the AWS AccountId will be used for endpoint routing.

#### Inherited from

`Partial.accountIdEndpointMode`

---

### apiVersion?

> `readonly` `optional` **apiVersion?**: `string`

Defined in: node_modules/.pnpm/@smithy+smithy-client@3.7.0/node_modules/@smithy/smithy-client/dist-types/client.d.ts:12

**`Internal`**

The API version set internally by the SDK, and is
not planned to be used by customer code.

#### Inherited from

`Partial.apiVersion`

---

### base64Decoder?

> `optional` **base64Decoder?**: `Decoder`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:113

**`Internal`**

The function that will be used to convert a base64-encoded string to a byte array.

#### Inherited from

`Partial.base64Decoder`

---

### base64Encoder?

> `optional` **base64Encoder?**: `Encoder`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:118

**`Internal`**

The function that will be used to convert binary data to a base64-encoded string.

#### Inherited from

`Partial.base64Encoder`

---

### bodyLengthChecker?

> `optional` **bodyLengthChecker?**: `BodyLengthCalculator`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:103

**`Internal`**

A function that can calculate the length of a request body.

#### Inherited from

`Partial.bodyLengthChecker`

---

### cacheMiddleware?

> `optional` **cacheMiddleware?**: `boolean`

Defined in: node_modules/.pnpm/@smithy+smithy-client@3.7.0/node_modules/@smithy/smithy-client/dist-types/client.d.ts:28

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

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:170

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

Defined in: node_modules/.pnpm/@aws-sdk+core@3.696.0/node_modules/@aws-sdk/core/dist-types/submodules/httpAuthSchemes/aws_sdk/resolveAwsSdkSigV4Config.d.ts:10

The credentials used to sign requests.

#### Inherited from

`Partial.credentials`

---

### customUserAgent?

> `optional` **customUserAgent?**: `string` \| `UserAgent`

Defined in: node_modules/.pnpm/@aws-sdk+middleware-user-agent@3.696.0/node_modules/@aws-sdk/middleware-user-agent/dist-types/configurations.d.ts:13

The custom user agent header that would be appended to default one

#### Inherited from

`Partial.customUserAgent`

---

### defaultsMode?

> `optional` **defaultsMode?**: `DefaultsMode` \| `Provider`\<`DefaultsMode`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:192

The @smithy/smithy-client#DefaultsMode that will be used to determine how certain default configuration options are resolved in the SDK.

#### Inherited from

`Partial.defaultsMode`

---

### defaultUserAgentProvider?

> `optional` **defaultUserAgentProvider?**: `Provider`\<`UserAgent`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:164

**`Internal`**

The provider populating default tracking information to be sent with `user-agent`, `x-amz-user-agent` header

#### Inherited from

`Partial.defaultUserAgentProvider`

---

### disableHostPrefix?

> `optional` **disableHostPrefix?**: `boolean`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:138

Disable dynamically changing the endpoint of the client based on the hostPrefix
trait of an operation.

#### Inherited from

`Partial.disableHostPrefix`

---

### endpoint?

> `optional` **endpoint?**: (string \| Endpoint \| Provider\<Endpoint\> \| EndpointV2 \| Provider\<EndpointV2\>) & (string \| Provider\<string\> \| Endpoint \| Provider\<...\> \| EndpointV2 \| Provider\<...\>)

Defined in: node_modules/.pnpm/@smithy+middleware-endpoint@3.2.8/node_modules/@smithy/middleware-endpoint/dist-types/resolveEndpointConfig.d.ts:17

The fully qualified endpoint of the webservice. This is only for using
a custom endpoint (for example, when using a local version of S3).

Endpoint transformations such as S3 applying a bucket to the hostname are
still applicable to this custom endpoint.

#### Inherited from

`Partial.endpoint`

---

### endpointCacheSize?

> `optional` **endpointCacheSize?**: `number`

Defined in: node_modules/.pnpm/@aws-sdk+middleware-endpoint-discovery@3.696.0/node_modules/@aws-sdk/middleware-endpoint-discovery/dist-types/resolveEndpointDiscoveryConfig.d.ts:16

The size of the client cache storing endpoints from endpoint discovery operations.
Defaults to 1000.

#### Inherited from

`Partial.endpointCacheSize`

---

### endpointDiscoveryEnabled?

> `optional` **endpointDiscoveryEnabled?**: `boolean`

Defined in: node_modules/.pnpm/@aws-sdk+middleware-endpoint-discovery@3.696.0/node_modules/@aws-sdk/middleware-endpoint-discovery/dist-types/resolveEndpointDiscoveryConfig.d.ts:24

Whether to call operations with endpoints given by service dynamically.
Setting this config to `true` will enable endpoint discovery for all applicable operations.
Setting it to `false` will explicitly disable endpoint discovery even though operations that
require endpoint discovery will presumably fail. Leaving it to undefined means SDK only do
endpoint discovery when it's required. Defaults to `undefined`.

#### Inherited from

`Partial.endpointDiscoveryEnabled`

---

### endpointDiscoveryEnabledProvider?

> `optional` **endpointDiscoveryEnabledProvider?**: `Provider`\<`boolean` \| `undefined`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:198

**`Internal`**

The provider which populates default for endpointDiscoveryEnabled configuration, if it's
not passed during client creation.

#### Inherited from

`Partial.endpointDiscoveryEnabledProvider`

---

### endpointProvider?

> `optional` **endpointProvider?**: (`params`, `context?`) => `EndpointV2`

Defined in: node_modules/.pnpm/@smithy+middleware-endpoint@3.2.8/node_modules/@smithy/middleware-endpoint/dist-types/resolveEndpointConfig.d.ts:23

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

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:188

Optional extensions

#### Inherited from

`Partial.extensions`

---

### httpAuthSchemeProvider?

> `optional` **httpAuthSchemeProvider?**: `DynamoDBHttpAuthSchemeProvider`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/auth/httpAuthSchemeProvider.d.ts:41

**`Internal`**

Configuration of an HttpAuthSchemeProvider for a client which resolves which HttpAuthScheme to use.

#### Inherited from

`Partial.httpAuthSchemeProvider`

---

### httpAuthSchemes?

> `optional` **httpAuthSchemes?**: `HttpAuthScheme`[]

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/auth/httpAuthSchemeProvider.d.ts:36

**`Internal`**

Configuration of HttpAuthSchemes for a client which provides default identity providers and signers per auth scheme.

#### Inherited from

`Partial.httpAuthSchemes`

---

### logger?

> `optional` **logger?**: `Logger`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:184

Optional logger for logging debug/info/warn/error.

#### Inherited from

`Partial.logger`

---

### maxAttempts?

> `optional` **maxAttempts?**: `number` \| `Provider`\<`number`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:174

Value for how many times a request will be made at most in case of retry.

#### Inherited from

`Partial.maxAttempts`

---

### prefix?

> `optional` **prefix?**: `string`

Defined in: [packages/aws/src/dynamodb.ts:28](https://github.com/vercel/vercel/blob/main/packages/aws/src/dynamodb.ts#L28)

The env var prefix the Marketplace integration was linked under
(e.g. `STORAGE3`). Defaults to autodetect via the resource ARN.

---

### region?

> `optional` **region?**: `string`

Defined in: [packages/aws/src/dynamodb.ts:30](https://github.com/vercel/vercel/blob/main/packages/aws/src/dynamodb.ts#L30)

Overrides `<prefix>_AWS_REGION`.

#### Overrides

`Partial.region`

---

### requestHandler?

> `optional` **requestHandler?**: (Record\<string, unknown\> \| NodeHttpHandlerOptions \| FetchHttpHandlerOptions \| RequestHandler\<any, any, HttpHandlerOptions\>) & HttpHandlerUserInput

Defined in: node_modules/.pnpm/@smithy+smithy-client@3.7.0/node_modules/@smithy/smithy-client/dist-types/client.d.ts:6

The HTTP handler to use or its constructor options. Fetch in browser and Https in Nodejs.

#### Inherited from

`Partial.requestHandler`

---

### retryMode?

> `optional` **retryMode?**: `string` \| `Provider`\<`string`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:180

Specifies which retry algorithm to use.

#### See

https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-smithy-util-retry/Enum/RETRY_MODES/

#### Inherited from

`Partial.retryMode`

---

### retryStrategy?

> `optional` **retryStrategy?**: `RetryStrategy` \| `RetryStrategyV2`

Defined in: node_modules/.pnpm/@smithy+middleware-retry@3.0.34/node_modules/@smithy/middleware-retry/dist-types/configurations.d.ts:26

The strategy to retry the request. Using built-in exponential backoff strategy by default.

#### Inherited from

`Partial.retryStrategy`

---

### roleArn?

> `optional` **roleArn?**: `string`

Defined in: [packages/aws/src/dynamodb.ts:32](https://github.com/vercel/vercel/blob/main/packages/aws/src/dynamodb.ts#L32)

Overrides `<prefix>_AWS_ROLE_ARN`.

---

### runtime?

> `optional` **runtime?**: `string`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:133

**`Internal`**

The runtime environment.

#### Inherited from

`Partial.runtime`

---

### serviceConfiguredEndpoint?

> `optional` **serviceConfiguredEndpoint?**: `undefined`

Defined in: node_modules/.pnpm/@smithy+middleware-endpoint@3.2.8/node_modules/@smithy/middleware-endpoint/dist-types/resolveEndpointConfig.d.ts:43

**`Internal`**

This field is used internally so you should not fill any value to this field.

#### Inherited from

`Partial.serviceConfiguredEndpoint`

---

### serviceId?

> `optional` **serviceId?**: `string`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:143

**`Internal`**

Unique service identifier.

#### Inherited from

`Partial.serviceId`

---

### sha256?

> `optional` **sha256?**: `ChecksumConstructor` \| `HashConstructor`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:93

**`Internal`**

A constructor for a class implementing the @smithy/types#ChecksumConstructor interface
that computes the SHA-256 HMAC or checksum of a string or binary buffer.

#### Inherited from

`Partial.sha256`

---

### signer?

> `optional` **signer?**: `RequestSigner` \| ((`authScheme?`) => [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`RequestSigner`\>)

Defined in: node_modules/.pnpm/@aws-sdk+core@3.696.0/node_modules/@aws-sdk/core/dist-types/submodules/httpAuthSchemes/aws_sdk/resolveAwsSdkSigV4Config.d.ts:14

The signer to use when signing requests.

#### Inherited from

`Partial.signer`

---

### signerConstructor?

> `optional` **signerConstructor?**: (`options`) => `RequestSigner`

Defined in: node_modules/.pnpm/@aws-sdk+core@3.696.0/node_modules/@aws-sdk/core/dist-types/submodules/httpAuthSchemes/aws_sdk/resolveAwsSdkSigV4Config.d.ts:34

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

Defined in: node_modules/.pnpm/@aws-sdk+core@3.696.0/node_modules/@aws-sdk/core/dist-types/submodules/httpAuthSchemes/aws_sdk/resolveAwsSdkSigV4Config.d.ts:18

Whether to escape request path when signing the request.

#### Inherited from

`Partial.signingEscapePath`

---

### signingRegion?

> `optional` **signingRegion?**: `string`

Defined in: node_modules/.pnpm/@aws-sdk+core@3.696.0/node_modules/@aws-sdk/core/dist-types/submodules/httpAuthSchemes/aws_sdk/resolveAwsSdkSigV4Config.d.ts:27

The region where you want to sign your request against. This
can be different to the region in the endpoint.

#### Inherited from

`Partial.signingRegion`

---

### streamCollector?

> `optional` **streamCollector?**: `StreamCollector`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:108

**`Internal`**

A function that converts a stream into an array of bytes.

#### Inherited from

`Partial.streamCollector`

---

### systemClockOffset?

> `optional` **systemClockOffset?**: `number`

Defined in: node_modules/.pnpm/@aws-sdk+core@3.696.0/node_modules/@aws-sdk/core/dist-types/submodules/httpAuthSchemes/aws_sdk/resolveAwsSdkSigV4Config.d.ts:22

An offset value in milliseconds to apply to all signing times.

#### Inherited from

`Partial.systemClockOffset`

---

### ~~tls?~~

> `optional` **tls?**: `boolean`

Defined in: node_modules/.pnpm/@smithy+middleware-endpoint@3.2.8/node_modules/@smithy/middleware-endpoint/dist-types/resolveEndpointConfig.d.ts:30

Whether TLS is enabled for requests.

#### Deprecated

#### Inherited from

`Partial.tls`

---

### urlParser?

> `optional` **urlParser?**: `UrlParser`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:98

**`Internal`**

The function that will be used to convert strings into HTTP endpoints.

#### Inherited from

`Partial.urlParser`

---

### useDualstackEndpoint?

> `optional` **useDualstackEndpoint?**: `boolean` \| `Provider`\<`boolean`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:147

Enables IPv6/IPv4 dualstack endpoint.

#### Inherited from

`Partial.useDualstackEndpoint`

---

### useFipsEndpoint?

> `optional` **useFipsEndpoint?**: `boolean` \| `Provider`\<`boolean`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:151

Enables FIPS compatible endpoints.

#### Inherited from

`Partial.useFipsEndpoint`

---

### userAgentAppId?

> `optional` **userAgentAppId?**: `string` \| `Provider`\<`string` \| `undefined`\>

Defined in: node_modules/.pnpm/@aws-sdk+middleware-user-agent@3.696.0/node_modules/@aws-sdk/middleware-user-agent/dist-types/configurations.d.ts:17

The application ID used to identify the application.

#### Inherited from

`Partial.userAgentAppId`

---

### utf8Decoder?

> `optional` **utf8Decoder?**: `Decoder`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:123

**`Internal`**

The function that will be used to convert a UTF8-encoded string to a byte array.

#### Inherited from

`Partial.utf8Decoder`

---

### utf8Encoder?

> `optional` **utf8Encoder?**: `Encoder`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:128

**`Internal`**

The function that will be used to convert binary data to a UTF-8 encoded string.

#### Inherited from

`Partial.utf8Encoder`
