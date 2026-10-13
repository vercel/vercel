[**@vercel/aws**](../README.md)

---

# Interface: CreateS3Options

Defined in: packages/aws/src/s3.ts:15

Options for [createS3](../functions/createS3.md).

All fields are optional. With no arguments, the factory finds the connected
S3 bucket by its `<prefix>_S3_BUCKET_NAME` env var, then reads every other
field from env vars under that prefix.

Any field on `S3ClientConfig` may also be passed and is forwarded to the
underlying client.

## Extends

- [`Partial`](https://www.typescriptlang.org/docs/handbook/utility-types.html#partialtype)\<`S3ClientConfig`\>

## Properties

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

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/auth/httpAuthSchemeProvider.d.ts:45

A comma-separated list of case-sensitive auth scheme names.
An auth scheme name is a fully qualified auth scheme ID with the namespace prefix trimmed.
For example, the auth scheme with ID aws.auth#sigv4 is named sigv4.

#### Inherited from

`Partial.authSchemePreference`

---

### base64Decoder?

> `optional` **base64Decoder?**: `Decoder`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:170

**`Internal`**

The function that will be used to convert a base64-encoded string to a byte array.

#### Inherited from

`Partial.base64Decoder`

---

### base64Encoder?

> `optional` **base64Encoder?**: `Encoder`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:175

**`Internal`**

The function that will be used to convert binary data to a base64-encoded string.

#### Inherited from

`Partial.base64Encoder`

---

### bodyLengthChecker?

> `optional` **bodyLengthChecker?**: `BodyLengthCalculator`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:160

**`Internal`**

A function that can calculate the length of a request body.

#### Inherited from

`Partial.bodyLengthChecker`

---

### bucket?

> `optional` **bucket?**: `string`

Defined in: packages/aws/src/s3.ts:23

Overrides `<prefix>_S3_BUCKET_NAME`.

---

### bucketEndpoint?

> `optional` **bucketEndpoint?**: `boolean`

Defined in: node_modules/.pnpm/@aws-sdk+middleware-sdk-s3@3.972.77/node_modules/@aws-sdk/middleware-sdk-s3/dist-types/submodules/s3/middleware-s3-configuration/s3Configuration.d.ts:35

Whether to use the bucket name as the endpoint for this client.

#### Inherited from

`Partial.bucketEndpoint`

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

### checksumAlgorithms?

> `optional` **checksumAlgorithms?**: `object` & `object`

Defined in: node_modules/.pnpm/@aws-sdk+checksums@3.1001.1/node_modules/@aws-sdk/checksums/dist-types/submodules/flexible-checksums/resolveFlexibleChecksumsConfig.d.ts:35

Optional implementations of checksum algorithms adhering to the
Checksum interface.

#### Type Declaration

##### CRC32?

> `optional` **CRC32?**: `ChecksumConstructor`

##### CRC32C?

> `optional` **CRC32C?**: `ChecksumConstructor`

##### CRC64NVME?

> `optional` **CRC64NVME?**: `ChecksumConstructor`

##### SHA1?

> `optional` **SHA1?**: `ChecksumConstructor`

##### SHA256?

> `optional` **SHA256?**: `ChecksumConstructor`

#### Inherited from

`Partial.checksumAlgorithms`

---

### clientContextParams?

> `optional` **clientContextParams?**: `object`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/endpoint/EndpointParameters.d.ts:6

#### disableS3ExpressSessionAuth?

> `optional` **disableS3ExpressSessionAuth?**: `boolean` \| `Provider`\<`boolean` \| `undefined`\>

#### Inherited from

`Partial.clientContextParams`

---

### ~~credentialDefaultProvider?~~

> `optional` **credentialDefaultProvider?**: (`input`) => `AwsCredentialIdentityProvider`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:264

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

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:290

The @smithy/smithy-client#DefaultsMode that will be used to determine how certain default configuration options are resolved in the SDK.

#### Inherited from

`Partial.defaultsMode`

---

### defaultUserAgentProvider?

> `optional` **defaultUserAgentProvider?**: `Provider`\<`UserAgent`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:235

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

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:195

Disable dynamically changing the endpoint of the client based on the hostPrefix
trait of an operation.

#### Inherited from

`Partial.disableHostPrefix`

---

### disableMultiregionAccessPoints?

> `optional` **disableMultiregionAccessPoints?**: boolean & (boolean \| Provider\<boolean \| undefined\>)

Defined in: node_modules/.pnpm/@aws-sdk+middleware-sdk-s3@3.972.77/node_modules/@aws-sdk/middleware-sdk-s3/dist-types/submodules/s3/middleware-s3-configuration/s3Configuration.d.ts:20

Whether multi-region access points (MRAP) should be disabled.

#### Inherited from

`Partial.disableMultiregionAccessPoints`

---

### disableS3ExpressSessionAuth?

> `optional` **disableS3ExpressSessionAuth?**: `boolean` \| `Provider`\<`boolean` \| `undefined`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/endpoint/EndpointParameters.d.ts:18

#### Inherited from

`Partial.disableS3ExpressSessionAuth`

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

### eventStreamSerdeProvider?

> `optional` **eventStreamSerdeProvider?**: `EventStreamSerdeProvider`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:286

The function that provides necessary utilities for generating and parsing event stream

#### Inherited from

`Partial.eventStreamSerdeProvider`

---

### expectContinueHeader?

> `optional` **expectContinueHeader?**: `number` \| `boolean`

Defined in: node_modules/.pnpm/@aws-sdk+middleware-sdk-s3@3.972.77/node_modules/@aws-sdk/middleware-sdk-s3/dist-types/submodules/s3/middleware-s3-configuration/s3Configuration.d.ts:51

This field configures the SDK's behavior around setting the `expect: 100-continue` header.

Default: 2_097_152 (2 MB)

When given as a boolean - always send or omit the header.
When given as a number - minimum byte threshold of the payload before setting the header.
Unmeasurable payload sizes (streams) will set the header too.

The `expect: 100-continue` header is used to allow the server a chance to validate the PUT request
headers before the client begins to send the object payload. This avoids wasteful data transmission for a
request that is rejected.

However, there is a trade-off where the request will take longer to complete.

#### Inherited from

`Partial.expectContinueHeader`

---

### extensions?

> `optional` **extensions?**: `RuntimeExtension`[]

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:282

Optional extensions

#### Inherited from

`Partial.extensions`

---

### followRegionRedirects?

> `optional` **followRegionRedirects?**: `boolean`

Defined in: node_modules/.pnpm/@aws-sdk+middleware-sdk-s3@3.972.77/node_modules/@aws-sdk/middleware-sdk-s3/dist-types/submodules/s3/middleware-s3-configuration/s3Configuration.d.ts:27

This feature was previously called the S3 Global Client.
This can result in additional latency as failed requests are retried
with a corrected region when receiving a permanent redirect error with status 301.
This feature should only be used as a last resort if you do not know the region of your bucket(s) ahead of time.

#### Inherited from

`Partial.followRegionRedirects`

---

### forcePathStyle?

> `optional` **forcePathStyle?**: boolean & (boolean \| Provider\<boolean \| undefined\>)

Defined in: node_modules/.pnpm/@aws-sdk+middleware-sdk-s3@3.972.77/node_modules/@aws-sdk/middleware-sdk-s3/dist-types/submodules/s3/middleware-s3-configuration/s3Configuration.d.ts:12

Whether to force path style URLs for S3 objects
(e.g., https://s3.amazonaws.com/<bucketName>/<key> instead of https://<bucketName>.s3.amazonaws.com/<key>

#### Inherited from

`Partial.forcePathStyle`

---

### getAwsChunkedEncodingStream?

> `optional` **getAwsChunkedEncodingStream?**: `GetAwsChunkedEncodingStream`\<`any`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:258

**`Internal`**

A function that returns Readable Stream which follows aws-chunked encoding stream.

#### Inherited from

`Partial.getAwsChunkedEncodingStream`

---

### httpAuthSchemeProvider?

> `optional` **httpAuthSchemeProvider?**: `S3HttpAuthSchemeProvider`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/auth/httpAuthSchemeProvider.d.ts:55

**`Internal`**

Configuration of an HttpAuthSchemeProvider for a client which resolves which HttpAuthScheme to use.

#### Inherited from

`Partial.httpAuthSchemeProvider`

---

### httpAuthSchemes?

> `optional` **httpAuthSchemes?**: `HttpAuthScheme`[]

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/auth/httpAuthSchemeProvider.d.ts:50

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

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:278

Optional logger for logging debug/info/warn/error.

#### Inherited from

`Partial.logger`

---

### maxAttempts?

> `optional` **maxAttempts?**: `number` \| `Provider`\<`number`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:268

Value for how many times a request will be made at most in case of retry.

#### Inherited from

`Partial.maxAttempts`

---

### md5?

> `optional` **md5?**: `ChecksumConstructor` \| `HashConstructor`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:247

**`Internal`**

A constructor for a class implementing the \_\_Checksum interface
that computes MD5 hashes.

#### Inherited from

`Partial.md5`

---

### prefix?

> `optional` **prefix?**: `string`

Defined in: packages/aws/src/s3.ts:21

The env var prefix the Marketplace integration was linked under
(e.g. `STORAGE2`). Defaults to autodetect — only required when multiple
S3 buckets are connected.

---

### profile?

> `optional` **profile?**: `string`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:230

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

Defined in: packages/aws/src/s3.ts:25

Overrides `<prefix>_AWS_REGION`.

#### Overrides

`Partial.region`

---

### requestChecksumCalculation?

> `optional` **requestChecksumCalculation?**: `RequestChecksumCalculation` \| `Provider`\<`RequestChecksumCalculation`\>

Defined in: node_modules/.pnpm/@aws-sdk+checksums@3.1001.1/node_modules/@aws-sdk/checksums/dist-types/submodules/flexible-checksums/resolveFlexibleChecksumsConfig.d.ts:10

Determines when a checksum will be calculated for request payloads.

#### Inherited from

`Partial.requestChecksumCalculation`

---

### requestHandler?

> `optional` **requestHandler?**: (NodeHttpHandlerOptions \| FetchHttpHandlerOptions \| Record\<string, unknown\> \| RequestHandler\<any, any, HttpHandlerOptions\>) & HttpHandlerUserInput

Defined in: node_modules/.pnpm/@smithy+core@3.35.1/node_modules/@smithy/core/dist-types/submodules/client/smithy-client/client.d.ts:17

#### Inherited from

`Partial.requestHandler`

---

### requestStreamBufferSize?

> `optional` **requestStreamBufferSize?**: `number` \| `false`

Defined in: node_modules/.pnpm/@aws-sdk+checksums@3.1001.1/node_modules/@aws-sdk/checksums/dist-types/submodules/flexible-checksums/resolveFlexibleChecksumsConfig.d.ts:30

Default 0 (off).

When set to a value greater than or equal to 8192, sets the minimum number
of bytes to buffer into a chunk when processing input streams
with chunked encoding (that is, when request checksums are enabled).
A minimum of 8kb = 8 \* 1024 is required, and 64kb or higher is recommended.

See https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-streaming.html.

This has a slight performance penalty because it must wrap and buffer
your input stream.
You do not need to set this value if your stream already flows chunks
of 8kb or greater.

#### Inherited from

`Partial.requestStreamBufferSize`

---

### responseChecksumValidation?

> `optional` **responseChecksumValidation?**: `ResponseChecksumValidation` \| `Provider`\<`ResponseChecksumValidation`\>

Defined in: node_modules/.pnpm/@aws-sdk+checksums@3.1001.1/node_modules/@aws-sdk/checksums/dist-types/submodules/flexible-checksums/resolveFlexibleChecksumsConfig.d.ts:14

Determines when checksum validation will be performed on response payloads.

#### Inherited from

`Partial.responseChecksumValidation`

---

### retryMode?

> `optional` **retryMode?**: `string` \| `Provider`\<`string`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:274

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

Defined in: packages/aws/src/s3.ts:27

Overrides `<prefix>_AWS_ROLE_ARN`.

---

### runtime?

> `optional` **runtime?**: `string`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:190

**`Internal`**

The runtime environment.

#### Inherited from

`Partial.runtime`

---

### s3ExpressIdentityProvider?

> `optional` **s3ExpressIdentityProvider?**: `S3ExpressIdentityProvider`

Defined in: node_modules/.pnpm/@aws-sdk+middleware-sdk-s3@3.972.77/node_modules/@aws-sdk/middleware-sdk-s3/dist-types/submodules/s3/middleware-s3-configuration/s3Configuration.d.ts:31

Identity provider for an S3 feature.

#### Inherited from

`Partial.s3ExpressIdentityProvider`

---

### sdkStreamMixin?

> `optional` **sdkStreamMixin?**: `SdkStreamMixinInjector`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:303

**`Internal`**

The internal function that inject utilities to runtime-specific stream to help users consume the data

#### Inherited from

`Partial.sdkStreamMixin`

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

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:200

**`Internal`**

Unique service identifier.

#### Inherited from

`Partial.serviceId`

---

### sha1?

> `optional` **sha1?**: `ChecksumConstructor` \| `HashConstructor`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:253

**`Internal`**

A constructor for a class implementing the \_\_Checksum interface
that computes SHA1 hashes.

#### Inherited from

`Partial.sha1`

---

### sha256?

> `optional` **sha256?**: `ChecksumConstructor` \| `HashConstructor`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:150

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

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:294

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

### sigv4aSigningRegionSet?

> `optional` **sigv4aSigningRegionSet?**: `string`[] \| `Provider`\<`string`[] \| `undefined`\>

Defined in: node_modules/.pnpm/@aws-sdk+core@3.978.1/node_modules/@aws-sdk/core/dist-types/submodules/httpAuthSchemes/aws_sdk/resolveAwsSdkSigV4AConfig.d.ts:18

This option will override the AWS sigv4a
signing regionSet from any other source.

The lookup order is:

1. this value
2. configuration file value of sigv4a_signing_region_set.
3. environment value of AWS_SIGV4A_SIGNING_REGION_SET.
4. signingRegionSet given by endpoint resolution.
5. the singular region of the SDK client.

#### Inherited from

`Partial.sigv4aSigningRegionSet`

---

### streamCollector?

> `optional` **streamCollector?**: `StreamCollector`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:165

**`Internal`**

A function that converts a stream into an array of bytes.

#### Inherited from

`Partial.streamCollector`

---

### streamHasher?

> `optional` **streamHasher?**: `StreamHasher`\<`Readable`\> \| `StreamHasher`\<[`Blob`](https://developer.mozilla.org/docs/Web/API/Blob)\>

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:241

**`Internal`**

A function that, given a hash constructor and a stream, calculates the
hash of the streamed value.

#### Inherited from

`Partial.streamHasher`

---

### systemClockOffset?

> `optional` **systemClockOffset?**: `number`

Defined in: node_modules/.pnpm/@aws-sdk+core@3.978.1/node_modules/@aws-sdk/core/dist-types/submodules/httpAuthSchemes/aws_sdk/resolveAwsSdkSigV4Config.d.ts:23

An offset value in milliseconds to apply to all signing times.

#### Inherited from

`Partial.systemClockOffset`

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

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:155

**`Internal`**

The function that will be used to convert strings into HTTP endpoints.

#### Inherited from

`Partial.urlParser`

---

### useAccelerateEndpoint?

> `optional` **useAccelerateEndpoint?**: boolean & (boolean \| Provider\<boolean \| undefined\>)

Defined in: node_modules/.pnpm/@aws-sdk+middleware-sdk-s3@3.972.77/node_modules/@aws-sdk/middleware-sdk-s3/dist-types/submodules/s3/middleware-s3-configuration/s3Configuration.d.ts:16

Whether to use the S3 Transfer Acceleration endpoint by default

#### Inherited from

`Partial.useAccelerateEndpoint`

---

### useArnRegion?

> `optional` **useArnRegion?**: `boolean` \| `Provider`\<`boolean` \| `undefined`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:298

Whether to override the request region with the region inferred from requested resource's ARN. Defaults to undefined.

#### Inherited from

`Partial.useArnRegion`

---

### useDualstackEndpoint?

> `optional` **useDualstackEndpoint?**: (boolean \| Provider\<boolean\>) & (boolean \| Provider\<boolean \| undefined\>)

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:204

Enables IPv6/IPv4 dualstack endpoint.

#### Inherited from

`Partial.useDualstackEndpoint`

---

### useFipsEndpoint?

> `optional` **useFipsEndpoint?**: (boolean \| Provider\<boolean\>) & (boolean \| Provider\<boolean \| undefined\>)

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:208

Enables FIPS compatible endpoints.

#### Inherited from

`Partial.useFipsEndpoint`

---

### useGlobalEndpoint?

> `optional` **useGlobalEndpoint?**: `boolean` \| `Provider`\<`boolean` \| `undefined`\>

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/endpoint/EndpointParameters.d.ts:15

#### Inherited from

`Partial.useGlobalEndpoint`

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

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:180

**`Internal`**

The function that will be used to convert a UTF8-encoded string to a byte array.

#### Inherited from

`Partial.utf8Decoder`

---

### utf8Encoder?

> `optional` **utf8Encoder?**: `Encoder`

Defined in: node_modules/.pnpm/@aws-sdk+client-s3@3.1146.0/node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts:185

**`Internal`**

The function that will be used to convert binary data to a UTF-8 encoded string.

#### Inherited from

`Partial.utf8Encoder`
