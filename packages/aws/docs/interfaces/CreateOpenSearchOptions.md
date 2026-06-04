[**@vercel/aws**](../README.md)

---

# Interface: CreateOpenSearchOptions

Defined in: [packages/aws/src/opensearch.ts:18](https://github.com/vercel/vercel/blob/main/packages/aws/src/opensearch.ts#L18)

Options for [createOpenSearch](../functions/createOpenSearch.md).

All fields are optional. With no arguments, the factory finds the connected
OpenSearch resource by scanning env for a `_AWS_RESOURCE_ARN` starting
with `arn:aws:aoss:`, then reads every other field from env vars under
that prefix.

Any field on the underlying `ClientOptions` from
`@opensearch-project/opensearch` may also be passed and is forwarded to the
`Client`.

## Extends

- [`Partial`](https://www.typescriptlang.org/docs/handbook/utility-types.html#partialtype)\<`ClientOptions`\>

## Properties

### agent?

> `optional` **agent?**: `false` \| `AgentOptions` \| `agentFn`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:84

#### Inherited from

`Partial.agent`

---

### auth?

> `optional` **auth?**: `BasicAuth` \| `AwsSigv4Auth`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:91

#### Inherited from

`Partial.auth`

---

### cloud?

> `optional` **cloud?**: `object`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:95

#### id

> **id**: `string`

#### password?

> `optional` **password?**: `string`

#### username?

> `optional` **username?**: `string`

#### Inherited from

`Partial.cloud`

---

### compression?

> `optional` **compression?**: `"gzip"`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:82

#### Inherited from

`Partial.compression`

---

### Connection?

> `optional` **Connection?**: _typeof_ `default`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:69

#### Inherited from

`Partial.Connection`

---

### ConnectionPool?

> `optional` **ConnectionPool?**: _typeof_ `ConnectionPool`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:70

#### Inherited from

`Partial.ConnectionPool`

---

### context?

> `optional` **context?**: `unknown`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:92

#### Inherited from

`Partial.context`

---

### disablePrototypePoisoningProtection?

> `optional` **disablePrototypePoisoningProtection?**: `boolean` \| `"proto"` \| `"constructor"`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:100

#### Inherited from

`Partial.disablePrototypePoisoningProtection`

---

### enableLongNumeralSupport?

> `optional` **enableLongNumeralSupport?**: `boolean`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:102

#### Inherited from

`Partial.enableLongNumeralSupport`

---

### enableMetaHeader?

> `optional` **enableMetaHeader?**: `boolean`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:94

#### Inherited from

`Partial.enableMetaHeader`

---

### endpoint?

> `optional` **endpoint?**: `string`

Defined in: [packages/aws/src/opensearch.ts:27](https://github.com/vercel/vercel/blob/main/packages/aws/src/opensearch.ts#L27)

Overrides `<prefix>_OPENSEARCH_ENDPOINT`.

---

### generateRequestId?

> `optional` **generateRequestId?**: `generateRequestIdFn`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:89

#### Inherited from

`Partial.generateRequestId`

---

### headers?

> `optional` **headers?**: [`Record`](https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type)\<`string`, `any`\>

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:87

#### Inherited from

`Partial.headers`

---

### maxRetries?

> `optional` **maxRetries?**: `number`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:73

#### Inherited from

`Partial.maxRetries`

---

### memoryCircuitBreaker?

> `optional` **memoryCircuitBreaker?**: `MemoryCircuitBreakerOptions`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:101

#### Inherited from

`Partial.memoryCircuitBreaker`

---

### name?

> `optional` **name?**: `string` \| `symbol`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:90

#### Inherited from

`Partial.name`

---

### node?

> `optional` **node?**: `string` \| `string`[] \| `NodeOptions` \| `NodeOptions`[]

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:67

#### Inherited from

`Partial.node`

---

### nodeFilter?

> `optional` **nodeFilter?**: `nodeFilterFn`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:85

#### Inherited from

`Partial.nodeFilter`

---

### nodes?

> `optional` **nodes?**: `string` \| `string`[] \| `NodeOptions` \| `NodeOptions`[]

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:68

#### Inherited from

`Partial.nodes`

---

### nodeSelector?

> `optional` **nodeSelector?**: `string` \| `nodeSelectorFn`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:86

#### Inherited from

`Partial.nodeSelector`

---

### opaqueIdPrefix?

> `optional` **opaqueIdPrefix?**: `string`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:88

#### Inherited from

`Partial.opaqueIdPrefix`

---

### pingTimeout?

> `optional` **pingTimeout?**: `number`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:75

#### Inherited from

`Partial.pingTimeout`

---

### prefix?

> `optional` **prefix?**: `string`

Defined in: [packages/aws/src/opensearch.ts:25](https://github.com/vercel/vercel/blob/main/packages/aws/src/opensearch.ts#L25)

The env var prefix the Marketplace integration was linked under
(e.g. `STORAGE`, `STORAGE2`, or a custom name). Defaults to autodetect
via the resource ARN — only required when multiple OpenSearch resources
are connected.

---

### proxy?

> `optional` **proxy?**: `string` \| `URL`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:93

#### Inherited from

`Partial.proxy`

---

### region?

> `optional` **region?**: `string`

Defined in: [packages/aws/src/opensearch.ts:29](https://github.com/vercel/vercel/blob/main/packages/aws/src/opensearch.ts#L29)

Overrides `<prefix>_AWS_REGION`.

---

### requestTimeout?

> `optional` **requestTimeout?**: `number`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:74

#### Inherited from

`Partial.requestTimeout`

---

### resurrectStrategy?

> `optional` **resurrectStrategy?**: `"ping"` \| `"optimistic"` \| `"none"`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:80

#### Inherited from

`Partial.resurrectStrategy`

---

### roleArn?

> `optional` **roleArn?**: `string`

Defined in: [packages/aws/src/opensearch.ts:31](https://github.com/vercel/vercel/blob/main/packages/aws/src/opensearch.ts#L31)

Overrides `<prefix>_AWS_ROLE_ARN`.

---

### Serializer?

> `optional` **Serializer?**: _typeof_ `default`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:72

#### Inherited from

`Partial.Serializer`

---

### sniffEndpoint?

> `optional` **sniffEndpoint?**: `string`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:78

#### Inherited from

`Partial.sniffEndpoint`

---

### sniffInterval?

> `optional` **sniffInterval?**: `number` \| `boolean`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:76

#### Inherited from

`Partial.sniffInterval`

---

### sniffOnConnectionFault?

> `optional` **sniffOnConnectionFault?**: `boolean`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:79

#### Inherited from

`Partial.sniffOnConnectionFault`

---

### sniffOnStart?

> `optional` **sniffOnStart?**: `boolean`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:77

#### Inherited from

`Partial.sniffOnStart`

---

### ssl?

> `optional` **ssl?**: `ConnectionOptions`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:83

#### Inherited from

`Partial.ssl`

---

### suggestCompression?

> `optional` **suggestCompression?**: `boolean`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:81

#### Inherited from

`Partial.suggestCompression`

---

### Transport?

> `optional` **Transport?**: _typeof_ `default`

Defined in: node_modules/.pnpm/@opensearch-project+opensearch@3.3.0/node_modules/@opensearch-project/opensearch/lib/Client.d.ts:71

#### Inherited from

`Partial.Transport`
