[**@vercel/aws**](../README.md)

---

# Interface: CreateDynamoDBDocumentOptions

Defined in: [packages/aws/src/dynamodb.ts:38](https://github.com/vercel/vercel/blob/main/packages/aws/src/dynamodb.ts#L38)

Options for [createDynamoDBDocument](../functions/createDynamoDBDocument.md).

## Extends

- [`CreateDynamoDBOptions`](CreateDynamoDBOptions.md)

## Properties

### accountId?

> `optional` **accountId?**: `string` \| `Provider`\<`string`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/endpoint/EndpointParameters.d.ts:10

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`accountId`](CreateDynamoDBOptions.md#accountid)

---

### accountIdEndpointMode?

> `optional` **accountIdEndpointMode?**: (AccountIdEndpointMode \| Provider\<AccountIdEndpointMode\>) & (string \| Provider\<string\>)

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:159

Defines if the AWS AccountId will be used for endpoint routing.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`accountIdEndpointMode`](CreateDynamoDBOptions.md#accountidendpointmode)

---

### apiVersion?

> `readonly` `optional` **apiVersion?**: `string`

Defined in: node_modules/.pnpm/@smithy+smithy-client@3.7.0/node_modules/@smithy/smithy-client/dist-types/client.d.ts:12

**`Internal`**

The API version set internally by the SDK, and is
not planned to be used by customer code.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`apiVersion`](CreateDynamoDBOptions.md#apiversion)

---

### base64Decoder?

> `optional` **base64Decoder?**: `Decoder`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:113

**`Internal`**

The function that will be used to convert a base64-encoded string to a byte array.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`base64Decoder`](CreateDynamoDBOptions.md#base64decoder)

---

### base64Encoder?

> `optional` **base64Encoder?**: `Encoder`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:118

**`Internal`**

The function that will be used to convert binary data to a base64-encoded string.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`base64Encoder`](CreateDynamoDBOptions.md#base64encoder)

---

### bodyLengthChecker?

> `optional` **bodyLengthChecker?**: `BodyLengthCalculator`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:103

**`Internal`**

A function that can calculate the length of a request body.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`bodyLengthChecker`](CreateDynamoDBOptions.md#bodylengthchecker)

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

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`cacheMiddleware`](CreateDynamoDBOptions.md#cachemiddleware)

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

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`credentialDefaultProvider`](CreateDynamoDBOptions.md#credentialdefaultprovider)

---

### credentials?

> `optional` **credentials?**: `AwsCredentialIdentity` \| `AwsCredentialIdentityProvider`

Defined in: node_modules/.pnpm/@aws-sdk+core@3.696.0/node_modules/@aws-sdk/core/dist-types/submodules/httpAuthSchemes/aws_sdk/resolveAwsSdkSigV4Config.d.ts:10

The credentials used to sign requests.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`credentials`](CreateDynamoDBOptions.md#credentials)

---

### customUserAgent?

> `optional` **customUserAgent?**: `string` \| `UserAgent`

Defined in: node_modules/.pnpm/@aws-sdk+middleware-user-agent@3.696.0/node_modules/@aws-sdk/middleware-user-agent/dist-types/configurations.d.ts:13

The custom user agent header that would be appended to default one

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`customUserAgent`](CreateDynamoDBOptions.md#customuseragent)

---

### defaultsMode?

> `optional` **defaultsMode?**: `DefaultsMode` \| `Provider`\<`DefaultsMode`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:192

The @smithy/smithy-client#DefaultsMode that will be used to determine how certain default configuration options are resolved in the SDK.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`defaultsMode`](CreateDynamoDBOptions.md#defaultsmode)

---

### defaultUserAgentProvider?

> `optional` **defaultUserAgentProvider?**: `Provider`\<`UserAgent`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:164

**`Internal`**

The provider populating default tracking information to be sent with `user-agent`, `x-amz-user-agent` header

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`defaultUserAgentProvider`](CreateDynamoDBOptions.md#defaultuseragentprovider)

---

### disableHostPrefix?

> `optional` **disableHostPrefix?**: `boolean`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:138

Disable dynamically changing the endpoint of the client based on the hostPrefix
trait of an operation.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`disableHostPrefix`](CreateDynamoDBOptions.md#disablehostprefix)

---

### endpoint?

> `optional` **endpoint?**: (string \| Endpoint \| Provider\<Endpoint\> \| EndpointV2 \| Provider\<EndpointV2\>) & (string \| Provider\<string\> \| Endpoint \| Provider\<...\> \| EndpointV2 \| Provider\<...\>)

Defined in: node_modules/.pnpm/@smithy+middleware-endpoint@3.2.8/node_modules/@smithy/middleware-endpoint/dist-types/resolveEndpointConfig.d.ts:17

The fully qualified endpoint of the webservice. This is only for using
a custom endpoint (for example, when using a local version of S3).

Endpoint transformations such as S3 applying a bucket to the hostname are
still applicable to this custom endpoint.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`endpoint`](CreateDynamoDBOptions.md#endpoint)

---

### endpointCacheSize?

> `optional` **endpointCacheSize?**: `number`

Defined in: node_modules/.pnpm/@aws-sdk+middleware-endpoint-discovery@3.696.0/node_modules/@aws-sdk/middleware-endpoint-discovery/dist-types/resolveEndpointDiscoveryConfig.d.ts:16

The size of the client cache storing endpoints from endpoint discovery operations.
Defaults to 1000.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`endpointCacheSize`](CreateDynamoDBOptions.md#endpointcachesize)

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

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`endpointDiscoveryEnabled`](CreateDynamoDBOptions.md#endpointdiscoveryenabled)

---

### endpointDiscoveryEnabledProvider?

> `optional` **endpointDiscoveryEnabledProvider?**: `Provider`\<`boolean` \| `undefined`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:198

**`Internal`**

The provider which populates default for endpointDiscoveryEnabled configuration, if it's
not passed during client creation.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`endpointDiscoveryEnabledProvider`](CreateDynamoDBOptions.md#endpointdiscoveryenabledprovider)

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

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`endpointProvider`](CreateDynamoDBOptions.md#endpointprovider)

---

### extensions?

> `optional` **extensions?**: `RuntimeExtension`[]

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:188

Optional extensions

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`extensions`](CreateDynamoDBOptions.md#extensions)

---

### httpAuthSchemeProvider?

> `optional` **httpAuthSchemeProvider?**: `DynamoDBHttpAuthSchemeProvider`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/auth/httpAuthSchemeProvider.d.ts:41

**`Internal`**

Configuration of an HttpAuthSchemeProvider for a client which resolves which HttpAuthScheme to use.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`httpAuthSchemeProvider`](CreateDynamoDBOptions.md#httpauthschemeprovider)

---

### httpAuthSchemes?

> `optional` **httpAuthSchemes?**: `HttpAuthScheme`[]

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/auth/httpAuthSchemeProvider.d.ts:36

**`Internal`**

Configuration of HttpAuthSchemes for a client which provides default identity providers and signers per auth scheme.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`httpAuthSchemes`](CreateDynamoDBOptions.md#httpauthschemes)

---

### logger?

> `optional` **logger?**: `Logger`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:184

Optional logger for logging debug/info/warn/error.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`logger`](CreateDynamoDBOptions.md#logger)

---

### maxAttempts?

> `optional` **maxAttempts?**: `number` \| `Provider`\<`number`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:174

Value for how many times a request will be made at most in case of retry.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`maxAttempts`](CreateDynamoDBOptions.md#maxattempts)

---

### prefix?

> `optional` **prefix?**: `string`

Defined in: [packages/aws/src/dynamodb.ts:28](https://github.com/vercel/vercel/blob/main/packages/aws/src/dynamodb.ts#L28)

The env var prefix the Marketplace integration was linked under
(e.g. `STORAGE3`). Defaults to autodetect via the resource ARN.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`prefix`](CreateDynamoDBOptions.md#prefix)

---

### region?

> `optional` **region?**: `string`

Defined in: [packages/aws/src/dynamodb.ts:30](https://github.com/vercel/vercel/blob/main/packages/aws/src/dynamodb.ts#L30)

Overrides `<prefix>_AWS_REGION`.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`region`](CreateDynamoDBOptions.md#region)

---

### requestHandler?

> `optional` **requestHandler?**: (Record\<string, unknown\> \| NodeHttpHandlerOptions \| FetchHttpHandlerOptions \| RequestHandler\<any, any, HttpHandlerOptions\>) & HttpHandlerUserInput

Defined in: node_modules/.pnpm/@smithy+smithy-client@3.7.0/node_modules/@smithy/smithy-client/dist-types/client.d.ts:6

The HTTP handler to use or its constructor options. Fetch in browser and Https in Nodejs.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`requestHandler`](CreateDynamoDBOptions.md#requesthandler)

---

### retryMode?

> `optional` **retryMode?**: `string` \| `Provider`\<`string`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:180

Specifies which retry algorithm to use.

#### See

https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-smithy-util-retry/Enum/RETRY_MODES/

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`retryMode`](CreateDynamoDBOptions.md#retrymode)

---

### retryStrategy?

> `optional` **retryStrategy?**: `RetryStrategy` \| `RetryStrategyV2`

Defined in: node_modules/.pnpm/@smithy+middleware-retry@3.0.34/node_modules/@smithy/middleware-retry/dist-types/configurations.d.ts:26

The strategy to retry the request. Using built-in exponential backoff strategy by default.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`retryStrategy`](CreateDynamoDBOptions.md#retrystrategy)

---

### roleArn?

> `optional` **roleArn?**: `string`

Defined in: [packages/aws/src/dynamodb.ts:32](https://github.com/vercel/vercel/blob/main/packages/aws/src/dynamodb.ts#L32)

Overrides `<prefix>_AWS_ROLE_ARN`.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`roleArn`](CreateDynamoDBOptions.md#rolearn)

---

### runtime?

> `optional` **runtime?**: `string`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:133

**`Internal`**

The runtime environment.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`runtime`](CreateDynamoDBOptions.md#runtime)

---

### serviceConfiguredEndpoint?

> `optional` **serviceConfiguredEndpoint?**: `undefined`

Defined in: node_modules/.pnpm/@smithy+middleware-endpoint@3.2.8/node_modules/@smithy/middleware-endpoint/dist-types/resolveEndpointConfig.d.ts:43

**`Internal`**

This field is used internally so you should not fill any value to this field.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`serviceConfiguredEndpoint`](CreateDynamoDBOptions.md#serviceconfiguredendpoint)

---

### serviceId?

> `optional` **serviceId?**: `string`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:143

**`Internal`**

Unique service identifier.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`serviceId`](CreateDynamoDBOptions.md#serviceid)

---

### sha256?

> `optional` **sha256?**: `ChecksumConstructor` \| `HashConstructor`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:93

**`Internal`**

A constructor for a class implementing the @smithy/types#ChecksumConstructor interface
that computes the SHA-256 HMAC or checksum of a string or binary buffer.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`sha256`](CreateDynamoDBOptions.md#sha256)

---

### signer?

> `optional` **signer?**: `RequestSigner` \| ((`authScheme?`) => [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<`RequestSigner`\>)

Defined in: node_modules/.pnpm/@aws-sdk+core@3.696.0/node_modules/@aws-sdk/core/dist-types/submodules/httpAuthSchemes/aws_sdk/resolveAwsSdkSigV4Config.d.ts:14

The signer to use when signing requests.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`signer`](CreateDynamoDBOptions.md#signer)

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

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`signerConstructor`](CreateDynamoDBOptions.md#signerconstructor)

---

### signingEscapePath?

> `optional` **signingEscapePath?**: `boolean`

Defined in: node_modules/.pnpm/@aws-sdk+core@3.696.0/node_modules/@aws-sdk/core/dist-types/submodules/httpAuthSchemes/aws_sdk/resolveAwsSdkSigV4Config.d.ts:18

Whether to escape request path when signing the request.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`signingEscapePath`](CreateDynamoDBOptions.md#signingescapepath)

---

### signingRegion?

> `optional` **signingRegion?**: `string`

Defined in: node_modules/.pnpm/@aws-sdk+core@3.696.0/node_modules/@aws-sdk/core/dist-types/submodules/httpAuthSchemes/aws_sdk/resolveAwsSdkSigV4Config.d.ts:27

The region where you want to sign your request against. This
can be different to the region in the endpoint.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`signingRegion`](CreateDynamoDBOptions.md#signingregion)

---

### streamCollector?

> `optional` **streamCollector?**: `StreamCollector`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:108

**`Internal`**

A function that converts a stream into an array of bytes.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`streamCollector`](CreateDynamoDBOptions.md#streamcollector)

---

### systemClockOffset?

> `optional` **systemClockOffset?**: `number`

Defined in: node_modules/.pnpm/@aws-sdk+core@3.696.0/node_modules/@aws-sdk/core/dist-types/submodules/httpAuthSchemes/aws_sdk/resolveAwsSdkSigV4Config.d.ts:22

An offset value in milliseconds to apply to all signing times.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`systemClockOffset`](CreateDynamoDBOptions.md#systemclockoffset)

---

### ~~tls?~~

> `optional` **tls?**: `boolean`

Defined in: node_modules/.pnpm/@smithy+middleware-endpoint@3.2.8/node_modules/@smithy/middleware-endpoint/dist-types/resolveEndpointConfig.d.ts:30

Whether TLS is enabled for requests.

#### Deprecated

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`tls`](CreateDynamoDBOptions.md#tls)

---

### translateConfig?

> `optional` **translateConfig?**: `TranslateConfig`

Defined in: [packages/aws/src/dynamodb.ts:43](https://github.com/vercel/vercel/blob/main/packages/aws/src/dynamodb.ts#L43)

Marshalling/unmarshalling options forwarded to
`DynamoDBDocumentClient.from`.

---

### urlParser?

> `optional` **urlParser?**: `UrlParser`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:98

**`Internal`**

The function that will be used to convert strings into HTTP endpoints.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`urlParser`](CreateDynamoDBOptions.md#urlparser)

---

### useDualstackEndpoint?

> `optional` **useDualstackEndpoint?**: `boolean` \| `Provider`\<`boolean`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:147

Enables IPv6/IPv4 dualstack endpoint.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`useDualstackEndpoint`](CreateDynamoDBOptions.md#usedualstackendpoint)

---

### useFipsEndpoint?

> `optional` **useFipsEndpoint?**: `boolean` \| `Provider`\<`boolean`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:151

Enables FIPS compatible endpoints.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`useFipsEndpoint`](CreateDynamoDBOptions.md#usefipsendpoint)

---

### userAgentAppId?

> `optional` **userAgentAppId?**: `string` \| `Provider`\<`string` \| `undefined`\>

Defined in: node_modules/.pnpm/@aws-sdk+middleware-user-agent@3.696.0/node_modules/@aws-sdk/middleware-user-agent/dist-types/configurations.d.ts:17

The application ID used to identify the application.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`userAgentAppId`](CreateDynamoDBOptions.md#useragentappid)

---

### utf8Decoder?

> `optional` **utf8Decoder?**: `Decoder`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:123

**`Internal`**

The function that will be used to convert a UTF8-encoded string to a byte array.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`utf8Decoder`](CreateDynamoDBOptions.md#utf8decoder)

---

### utf8Encoder?

> `optional` **utf8Encoder?**: `Encoder`

Defined in: node_modules/.pnpm/@aws-sdk+client-dynamodb@3.705.0/node_modules/@aws-sdk/client-dynamodb/dist-types/DynamoDBClient.d.ts:128

**`Internal`**

The function that will be used to convert binary data to a UTF-8 encoded string.

#### Inherited from

[`CreateDynamoDBOptions`](CreateDynamoDBOptions.md).[`utf8Encoder`](CreateDynamoDBOptions.md#utf8encoder)
