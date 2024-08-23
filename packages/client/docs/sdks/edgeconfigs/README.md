# EdgeConfigs

(_edgeConfigs_)

## Overview

### Available Operations

- [list](#list) - Get Edge Configs
- [create](#create) - Create an Edge Config
- [get](#get) - Get an Edge Config
- [update](#update) - Update an Edge Config
- [delete](#delete) - Delete an Edge Config
- [getItems](#getitems) - Get Edge Config items
- [getSchema](#getschema) - Get Edge Config schema
- [updateSchema](#updateschema) - Update Edge Config schema
- [deleteSchema](#deleteschema) - Delete an Edge Config's schema
- [getItem](#getitem) - Get an Edge Config item
- [getTokens](#gettokens) - Get all tokens of an Edge Config
- [deleteTokens](#deletetokens) - Delete one or more Edge Config tokens
- [getToken](#gettoken) - Get Edge Config token meta data
- [createToken](#createtoken) - Create an Edge Config token

## list

Returns all Edge Configs.

### Example Usage

```typescript
import { Vercel } from '@vercel/client';

const vercel = new Vercel({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  const result = await vercel.edgeConfigs.list({});

  // Handle the result
  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { VercelCore } from '@vercel/client/core.js';
import { edgeConfigsList } from '@vercel/client/funcs/edgeConfigsList.js';

// Use `VercelCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const vercel = new VercelCore({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  const res = await edgeConfigsList(vercel, {});

  if (!res.ok) {
    throw res.error;
  }

  const { value: result } = res;

  // Handle the result
  console.log(result);
}

run();
```

### Parameters

| Parameter              | Type                                                                                    | Required           | Description                                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`              | [operations.GetEdgeConfigsRequest](../../models/operations/getedgeconfigsrequest.md)    | :heavy_check_mark: | The request object to use for the request.                                                                                                                                     |
| `options`              | RequestOptions                                                                          | :heavy_minus_sign: | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions` | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options) | :heavy_minus_sign: | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`      | [RetryConfig](../../lib/utils/retryconfig.md)                                           | :heavy_minus_sign: | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.GetEdgeConfigsResponseBody](../../models/operations/getedgeconfigsresponsebody.md)\>**

### Errors

| Error Object    | Status Code | Content Type |
| --------------- | ----------- | ------------ |
| errors.SDKError | 4xx-5xx     | _/_          |

## create

Creates an Edge Config.

### Example Usage

```typescript
import { Vercel } from '@vercel/client';

const vercel = new Vercel({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  const result = await vercel.edgeConfigs.create({});

  // Handle the result
  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { VercelCore } from '@vercel/client/core.js';
import { edgeConfigsCreate } from '@vercel/client/funcs/edgeConfigsCreate.js';

// Use `VercelCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const vercel = new VercelCore({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  const res = await edgeConfigsCreate(vercel, {});

  if (!res.ok) {
    throw res.error;
  }

  const { value: result } = res;

  // Handle the result
  console.log(result);
}

run();
```

### Parameters

| Parameter              | Type                                                                                     | Required           | Description                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`              | [operations.CreateEdgeConfigRequest](../../models/operations/createedgeconfigrequest.md) | :heavy_check_mark: | The request object to use for the request.                                                                                                                                     |
| `options`              | RequestOptions                                                                           | :heavy_minus_sign: | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions` | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)  | :heavy_minus_sign: | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`      | [RetryConfig](../../lib/utils/retryconfig.md)                                            | :heavy_minus_sign: | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.CreateEdgeConfigResponseBody](../../models/operations/createedgeconfigresponsebody.md)\>**

### Errors

| Error Object    | Status Code | Content Type |
| --------------- | ----------- | ------------ |
| errors.SDKError | 4xx-5xx     | _/_          |

## get

Returns an Edge Config.

### Example Usage

```typescript
import { Vercel } from '@vercel/client';

const vercel = new Vercel({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  const result = await vercel.edgeConfigs.get({
    edgeConfigId: '<value>',
  });

  // Handle the result
  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { VercelCore } from '@vercel/client/core.js';
import { edgeConfigsGet } from '@vercel/client/funcs/edgeConfigsGet.js';

// Use `VercelCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const vercel = new VercelCore({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  const res = await edgeConfigsGet(vercel, {
    edgeConfigId: '<value>',
  });

  if (!res.ok) {
    throw res.error;
  }

  const { value: result } = res;

  // Handle the result
  console.log(result);
}

run();
```

### Parameters

| Parameter              | Type                                                                                    | Required           | Description                                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`              | [operations.GetEdgeConfigRequest](../../models/operations/getedgeconfigrequest.md)      | :heavy_check_mark: | The request object to use for the request.                                                                                                                                     |
| `options`              | RequestOptions                                                                          | :heavy_minus_sign: | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions` | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options) | :heavy_minus_sign: | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`      | [RetryConfig](../../lib/utils/retryconfig.md)                                           | :heavy_minus_sign: | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.GetEdgeConfigResponseBody](../../models/operations/getedgeconfigresponsebody.md)\>**

### Errors

| Error Object    | Status Code | Content Type |
| --------------- | ----------- | ------------ |
| errors.SDKError | 4xx-5xx     | _/_          |

## update

Updates an Edge Config.

### Example Usage

```typescript
import { Vercel } from '@vercel/client';

const vercel = new Vercel({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  const result = await vercel.edgeConfigs.update({
    edgeConfigId: '<value>',
  });

  // Handle the result
  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { VercelCore } from '@vercel/client/core.js';
import { edgeConfigsUpdate } from '@vercel/client/funcs/edgeConfigsUpdate.js';

// Use `VercelCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const vercel = new VercelCore({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  const res = await edgeConfigsUpdate(vercel, {
    edgeConfigId: '<value>',
  });

  if (!res.ok) {
    throw res.error;
  }

  const { value: result } = res;

  // Handle the result
  console.log(result);
}

run();
```

### Parameters

| Parameter              | Type                                                                                     | Required           | Description                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`              | [operations.UpdateEdgeConfigRequest](../../models/operations/updateedgeconfigrequest.md) | :heavy_check_mark: | The request object to use for the request.                                                                                                                                     |
| `options`              | RequestOptions                                                                           | :heavy_minus_sign: | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions` | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)  | :heavy_minus_sign: | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`      | [RetryConfig](../../lib/utils/retryconfig.md)                                            | :heavy_minus_sign: | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.UpdateEdgeConfigResponseBody](../../models/operations/updateedgeconfigresponsebody.md)\>**

### Errors

| Error Object    | Status Code | Content Type |
| --------------- | ----------- | ------------ |
| errors.SDKError | 4xx-5xx     | _/_          |

## delete

Delete an Edge Config by id.

### Example Usage

```typescript
import { Vercel } from '@vercel/client';

const vercel = new Vercel({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  await vercel.edgeConfigs.delete({
    edgeConfigId: '<value>',
  });
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { VercelCore } from '@vercel/client/core.js';
import { edgeConfigsDelete } from '@vercel/client/funcs/edgeConfigsDelete.js';

// Use `VercelCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const vercel = new VercelCore({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  const res = await edgeConfigsDelete(vercel, {
    edgeConfigId: '<value>',
  });

  if (!res.ok) {
    throw res.error;
  }

  const { value: result } = res;
}

run();
```

### Parameters

| Parameter              | Type                                                                                     | Required           | Description                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`              | [operations.DeleteEdgeConfigRequest](../../models/operations/deleteedgeconfigrequest.md) | :heavy_check_mark: | The request object to use for the request.                                                                                                                                     |
| `options`              | RequestOptions                                                                           | :heavy_minus_sign: | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions` | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)  | :heavy_minus_sign: | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`      | [RetryConfig](../../lib/utils/retryconfig.md)                                            | :heavy_minus_sign: | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<void\>**

### Errors

| Error Object    | Status Code | Content Type |
| --------------- | ----------- | ------------ |
| errors.SDKError | 4xx-5xx     | _/_          |

## getItems

Returns all items of an Edge Config.

### Example Usage

```typescript
import { Vercel } from '@vercel/client';

const vercel = new Vercel({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  const result = await vercel.edgeConfigs.getItems({
    edgeConfigId: '<value>',
  });

  // Handle the result
  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { VercelCore } from '@vercel/client/core.js';
import { edgeConfigsGetItems } from '@vercel/client/funcs/edgeConfigsGetItems.js';

// Use `VercelCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const vercel = new VercelCore({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  const res = await edgeConfigsGetItems(vercel, {
    edgeConfigId: '<value>',
  });

  if (!res.ok) {
    throw res.error;
  }

  const { value: result } = res;

  // Handle the result
  console.log(result);
}

run();
```

### Parameters

| Parameter              | Type                                                                                         | Required           | Description                                                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`              | [operations.GetEdgeConfigItemsRequest](../../models/operations/getedgeconfigitemsrequest.md) | :heavy_check_mark: | The request object to use for the request.                                                                                                                                     |
| `options`              | RequestOptions                                                                               | :heavy_minus_sign: | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions` | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)      | :heavy_minus_sign: | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`      | [RetryConfig](../../lib/utils/retryconfig.md)                                                | :heavy_minus_sign: | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[components.EdgeConfigItem](../../models/components/edgeconfigitem.md)\>**

### Errors

| Error Object    | Status Code | Content Type |
| --------------- | ----------- | ------------ |
| errors.SDKError | 4xx-5xx     | _/_          |

## getSchema

Returns the schema of an Edge Config.

### Example Usage

```typescript
import { Vercel } from '@vercel/client';

const vercel = new Vercel({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  const result = await vercel.edgeConfigs.getSchema({
    edgeConfigId: '<value>',
  });

  // Handle the result
  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { VercelCore } from '@vercel/client/core.js';
import { edgeConfigsGetSchema } from '@vercel/client/funcs/edgeConfigsGetSchema.js';

// Use `VercelCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const vercel = new VercelCore({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  const res = await edgeConfigsGetSchema(vercel, {
    edgeConfigId: '<value>',
  });

  if (!res.ok) {
    throw res.error;
  }

  const { value: result } = res;

  // Handle the result
  console.log(result);
}

run();
```

### Parameters

| Parameter              | Type                                                                                           | Required           | Description                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`              | [operations.GetEdgeConfigSchemaRequest](../../models/operations/getedgeconfigschemarequest.md) | :heavy_check_mark: | The request object to use for the request.                                                                                                                                     |
| `options`              | RequestOptions                                                                                 | :heavy_minus_sign: | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions` | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)        | :heavy_minus_sign: | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`      | [RetryConfig](../../lib/utils/retryconfig.md)                                                  | :heavy_minus_sign: | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.GetEdgeConfigSchemaResponseBody](../../models/operations/getedgeconfigschemaresponsebody.md)\>**

### Errors

| Error Object    | Status Code | Content Type |
| --------------- | ----------- | ------------ |
| errors.SDKError | 4xx-5xx     | _/_          |

## updateSchema

Update an Edge Config's schema.

### Example Usage

```typescript
import { Vercel } from '@vercel/client';

const vercel = new Vercel({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  const result = await vercel.edgeConfigs.updateSchema({
    edgeConfigId: '<value>',
  });

  // Handle the result
  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { VercelCore } from '@vercel/client/core.js';
import { edgeConfigsUpdateSchema } from '@vercel/client/funcs/edgeConfigsUpdateSchema.js';

// Use `VercelCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const vercel = new VercelCore({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  const res = await edgeConfigsUpdateSchema(vercel, {
    edgeConfigId: '<value>',
  });

  if (!res.ok) {
    throw res.error;
  }

  const { value: result } = res;

  // Handle the result
  console.log(result);
}

run();
```

### Parameters

| Parameter              | Type                                                                                               | Required           | Description                                                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`              | [operations.PatchEdgeConfigSchemaRequest](../../models/operations/patchedgeconfigschemarequest.md) | :heavy_check_mark: | The request object to use for the request.                                                                                                                                     |
| `options`              | RequestOptions                                                                                     | :heavy_minus_sign: | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions` | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)            | :heavy_minus_sign: | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`      | [RetryConfig](../../lib/utils/retryconfig.md)                                                      | :heavy_minus_sign: | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.PatchEdgeConfigSchemaResponseBody](../../models/operations/patchedgeconfigschemaresponsebody.md)\>**

### Errors

| Error Object    | Status Code | Content Type |
| --------------- | ----------- | ------------ |
| errors.SDKError | 4xx-5xx     | _/_          |

## deleteSchema

Deletes the schema of existing Edge Config.

### Example Usage

```typescript
import { Vercel } from '@vercel/client';

const vercel = new Vercel({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  await vercel.edgeConfigs.deleteSchema({
    edgeConfigId: '<value>',
  });
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { VercelCore } from '@vercel/client/core.js';
import { edgeConfigsDeleteSchema } from '@vercel/client/funcs/edgeConfigsDeleteSchema.js';

// Use `VercelCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const vercel = new VercelCore({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  const res = await edgeConfigsDeleteSchema(vercel, {
    edgeConfigId: '<value>',
  });

  if (!res.ok) {
    throw res.error;
  }

  const { value: result } = res;
}

run();
```

### Parameters

| Parameter              | Type                                                                                                 | Required           | Description                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`              | [operations.DeleteEdgeConfigSchemaRequest](../../models/operations/deleteedgeconfigschemarequest.md) | :heavy_check_mark: | The request object to use for the request.                                                                                                                                     |
| `options`              | RequestOptions                                                                                       | :heavy_minus_sign: | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions` | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)              | :heavy_minus_sign: | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`      | [RetryConfig](../../lib/utils/retryconfig.md)                                                        | :heavy_minus_sign: | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<void\>**

### Errors

| Error Object    | Status Code | Content Type |
| --------------- | ----------- | ------------ |
| errors.SDKError | 4xx-5xx     | _/_          |

## getItem

Returns a specific Edge Config Item.

### Example Usage

```typescript
import { Vercel } from '@vercel/client';

const vercel = new Vercel({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  const result = await vercel.edgeConfigs.getItem({
    edgeConfigId: '<value>',
    edgeConfigItemKey: '<value>',
  });

  // Handle the result
  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { VercelCore } from '@vercel/client/core.js';
import { edgeConfigsGetItem } from '@vercel/client/funcs/edgeConfigsGetItem.js';

// Use `VercelCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const vercel = new VercelCore({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  const res = await edgeConfigsGetItem(vercel, {
    edgeConfigId: '<value>',
    edgeConfigItemKey: '<value>',
  });

  if (!res.ok) {
    throw res.error;
  }

  const { value: result } = res;

  // Handle the result
  console.log(result);
}

run();
```

### Parameters

| Parameter              | Type                                                                                       | Required           | Description                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`              | [operations.GetEdgeConfigItemRequest](../../models/operations/getedgeconfigitemrequest.md) | :heavy_check_mark: | The request object to use for the request.                                                                                                                                     |
| `options`              | RequestOptions                                                                             | :heavy_minus_sign: | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions` | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)    | :heavy_minus_sign: | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`      | [RetryConfig](../../lib/utils/retryconfig.md)                                              | :heavy_minus_sign: | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[components.EdgeConfigItem](../../models/components/edgeconfigitem.md)\>**

### Errors

| Error Object    | Status Code | Content Type |
| --------------- | ----------- | ------------ |
| errors.SDKError | 4xx-5xx     | _/_          |

## getTokens

Returns all tokens of an Edge Config.

### Example Usage

```typescript
import { Vercel } from '@vercel/client';

const vercel = new Vercel({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  const result = await vercel.edgeConfigs.getTokens({
    edgeConfigId: '<value>',
  });

  // Handle the result
  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { VercelCore } from '@vercel/client/core.js';
import { edgeConfigsGetTokens } from '@vercel/client/funcs/edgeConfigsGetTokens.js';

// Use `VercelCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const vercel = new VercelCore({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  const res = await edgeConfigsGetTokens(vercel, {
    edgeConfigId: '<value>',
  });

  if (!res.ok) {
    throw res.error;
  }

  const { value: result } = res;

  // Handle the result
  console.log(result);
}

run();
```

### Parameters

| Parameter              | Type                                                                                           | Required           | Description                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`              | [operations.GetEdgeConfigTokensRequest](../../models/operations/getedgeconfigtokensrequest.md) | :heavy_check_mark: | The request object to use for the request.                                                                                                                                     |
| `options`              | RequestOptions                                                                                 | :heavy_minus_sign: | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions` | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)        | :heavy_minus_sign: | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`      | [RetryConfig](../../lib/utils/retryconfig.md)                                                  | :heavy_minus_sign: | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[components.EdgeConfigToken](../../models/components/edgeconfigtoken.md)\>**

### Errors

| Error Object    | Status Code | Content Type |
| --------------- | ----------- | ------------ |
| errors.SDKError | 4xx-5xx     | _/_          |

## deleteTokens

Deletes one or more tokens of an existing Edge Config.

### Example Usage

```typescript
import { Vercel } from '@vercel/client';

const vercel = new Vercel({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  await vercel.edgeConfigs.deleteTokens({
    edgeConfigId: '<value>',
  });
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { VercelCore } from '@vercel/client/core.js';
import { edgeConfigsDeleteTokens } from '@vercel/client/funcs/edgeConfigsDeleteTokens.js';

// Use `VercelCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const vercel = new VercelCore({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  const res = await edgeConfigsDeleteTokens(vercel, {
    edgeConfigId: '<value>',
  });

  if (!res.ok) {
    throw res.error;
  }

  const { value: result } = res;
}

run();
```

### Parameters

| Parameter              | Type                                                                                                 | Required           | Description                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`              | [operations.DeleteEdgeConfigTokensRequest](../../models/operations/deleteedgeconfigtokensrequest.md) | :heavy_check_mark: | The request object to use for the request.                                                                                                                                     |
| `options`              | RequestOptions                                                                                       | :heavy_minus_sign: | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions` | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)              | :heavy_minus_sign: | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`      | [RetryConfig](../../lib/utils/retryconfig.md)                                                        | :heavy_minus_sign: | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<void\>**

### Errors

| Error Object    | Status Code | Content Type |
| --------------- | ----------- | ------------ |
| errors.SDKError | 4xx-5xx     | _/_          |

## getToken

Return meta data about an Edge Config token.

### Example Usage

```typescript
import { Vercel } from '@vercel/client';

const vercel = new Vercel({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  const result = await vercel.edgeConfigs.getToken({
    edgeConfigId: '<value>',
    token: '<value>',
  });

  // Handle the result
  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { VercelCore } from '@vercel/client/core.js';
import { edgeConfigsGetToken } from '@vercel/client/funcs/edgeConfigsGetToken.js';

// Use `VercelCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const vercel = new VercelCore({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  const res = await edgeConfigsGetToken(vercel, {
    edgeConfigId: '<value>',
    token: '<value>',
  });

  if (!res.ok) {
    throw res.error;
  }

  const { value: result } = res;

  // Handle the result
  console.log(result);
}

run();
```

### Parameters

| Parameter              | Type                                                                                         | Required           | Description                                                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`              | [operations.GetEdgeConfigTokenRequest](../../models/operations/getedgeconfigtokenrequest.md) | :heavy_check_mark: | The request object to use for the request.                                                                                                                                     |
| `options`              | RequestOptions                                                                               | :heavy_minus_sign: | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions` | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)      | :heavy_minus_sign: | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`      | [RetryConfig](../../lib/utils/retryconfig.md)                                                | :heavy_minus_sign: | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[components.EdgeConfigToken](../../models/components/edgeconfigtoken.md)\>**

### Errors

| Error Object    | Status Code | Content Type |
| --------------- | ----------- | ------------ |
| errors.SDKError | 4xx-5xx     | _/_          |

## createToken

Adds a token to an existing Edge Config.

### Example Usage

```typescript
import { Vercel } from '@vercel/client';

const vercel = new Vercel({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  const result = await vercel.edgeConfigs.createToken({
    edgeConfigId: '<value>',
  });

  // Handle the result
  console.log(result);
}

run();
```

### Standalone function

The standalone function version of this method:

```typescript
import { VercelCore } from '@vercel/client/core.js';
import { edgeConfigsCreateToken } from '@vercel/client/funcs/edgeConfigsCreateToken.js';

// Use `VercelCore` for best tree-shaking performance.
// You can create one instance of it to use across an application.
const vercel = new VercelCore({
  bearerToken: '<YOUR_BEARER_TOKEN_HERE>',
});

async function run() {
  const res = await edgeConfigsCreateToken(vercel, {
    edgeConfigId: '<value>',
  });

  if (!res.ok) {
    throw res.error;
  }

  const { value: result } = res;

  // Handle the result
  console.log(result);
}

run();
```

### Parameters

| Parameter              | Type                                                                                               | Required           | Description                                                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `request`              | [operations.CreateEdgeConfigTokenRequest](../../models/operations/createedgeconfigtokenrequest.md) | :heavy_check_mark: | The request object to use for the request.                                                                                                                                     |
| `options`              | RequestOptions                                                                                     | :heavy_minus_sign: | Used to set various options for making HTTP requests.                                                                                                                          |
| `options.fetchOptions` | [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options)            | :heavy_minus_sign: | Options that are passed to the underlying HTTP request. This can be used to inject extra headers for examples. All `Request` options, except `method` and `body`, are allowed. |
| `options.retries`      | [RetryConfig](../../lib/utils/retryconfig.md)                                                      | :heavy_minus_sign: | Enables retrying HTTP requests under certain failure conditions.                                                                                                               |

### Response

**Promise\<[operations.CreateEdgeConfigTokenResponseBody](../../models/operations/createedgeconfigtokenresponsebody.md)\>**

### Errors

| Error Object    | Status Code | Content Type |
| --------------- | ----------- | ------------ |
| errors.SDKError | 4xx-5xx     | _/_          |
