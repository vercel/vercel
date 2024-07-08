# @vercel/functions

## Table of contents

### Functions

- [geolocation](README.md#geolocation)
- [ipAddress](README.md#ipaddress)
- [systemEnvironmentVariables](README.md#systemenvironmentvariables)
- [waitUntil](README.md#waituntil)

## Functions

### geolocation

▸ **geolocation**(`request`): `Geo`

Returns the location information for the incoming request.

**`See`**

- CITY_HEADER_NAME
- COUNTRY_HEADER_NAME
- REGION_HEADER_NAME
- LATITUDE_HEADER_NAME
- LONGITUDE_HEADER_NAME

#### Parameters

| Name      | Type      | Description                                                     |
| :-------- | :-------- | :-------------------------------------------------------------- |
| `request` | `Request` | The incoming request object which provides the geolocation data |

#### Returns

`Geo`

#### Defined in

[headers.ts:128](https://github.com/vercel/vercel/blob/main/packages/functions/src/headers.ts#L128)

---

### ipAddress

▸ **ipAddress**(`request`): `string` \| `undefined`

Returns the IP address of the request from the headers.

**`See`**

IP_HEADER_NAME

#### Parameters

| Name      | Type      | Description                                       |
| :-------- | :-------- | :------------------------------------------------ |
| `request` | `Request` | The incoming request object which provides the IP |

#### Returns

`string` \| `undefined`

#### Defined in

[headers.ts:99](https://github.com/vercel/vercel/blob/main/packages/functions/src/headers.ts#L99)

---

### systemEnvironmentVariables

▸ **systemEnvironmentVariables**(`env?`): `Object`

#### Parameters

| Name  | Type     | Default value |
| :---- | :------- | :------------ |
| `env` | `Object` | `process.env` |

#### Returns

`Object`

| Name                              | Type                    |
| :-------------------------------- | :---------------------- |
| `CI`                              | `undefined` \| `string` |
| `VERCEL`                          | `undefined` \| `string` |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | `undefined` \| `string` |
| `VERCEL_BRANCH_URL`               | `undefined` \| `string` |
| `VERCEL_DEPLOYMENT_ID`            | `undefined` \| `string` |
| `VERCEL_ENV`                      | `undefined` \| `string` |
| `VERCEL_GIT_COMMIT_AUTHOR_LOGIN`  | `undefined` \| `string` |
| `VERCEL_GIT_COMMIT_AUTHOR_NAME`   | `undefined` \| `string` |
| `VERCEL_GIT_COMMIT_MESSAGE`       | `undefined` \| `string` |
| `VERCEL_GIT_COMMIT_REF`           | `undefined` \| `string` |
| `VERCEL_GIT_COMMIT_SHA`           | `undefined` \| `string` |
| `VERCEL_GIT_PREVIOUS_SHA`         | `undefined` \| `string` |
| `VERCEL_GIT_PROVIDER`             | `undefined` \| `string` |
| `VERCEL_GIT_PULL_REQUEST_ID`      | `undefined` \| `string` |
| `VERCEL_GIT_REPO_ID`              | `undefined` \| `string` |
| `VERCEL_GIT_REPO_OWNER`           | `undefined` \| `string` |
| `VERCEL_GIT_REPO_SLUG`            | `undefined` \| `string` |
| `VERCEL_PROJECT_PRODUCTION_URL`   | `undefined` \| `string` |
| `VERCEL_REGION`                   | `undefined` \| `string` |
| `VERCEL_SKEW_PROTECTION_ENABLED`  | `undefined` \| `string` |
| `VERCEL_URL`                      | `undefined` \| `string` |

#### Defined in

[system-environment-variables.ts:1](https://github.com/vercel/vercel/blob/main/packages/functions/src/system-environment-variables.ts#L1)

---

### waitUntil

▸ **waitUntil**(`promise`): `undefined` \| `void`

Extends the lifetime of the request handler for the lifetime of the given Promise

**`See`**

https://developer.mozilla.org/en-US/docs/Web/API/ExtendableEvent/waitUntil

**`Example`**

```
import { waitUntil } from '@vercel/functions';

export function GET(request) {
  waitUntil(fetch('https://vercel.com'));
  return new Response('OK');
}
```

#### Parameters

| Name      | Type                                                                                                              | Description              |
| :-------- | :---------------------------------------------------------------------------------------------------------------- | :----------------------- |
| `promise` | [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<`unknown`\> | The promise to wait for. |

#### Returns

`undefined` \| `void`

#### Defined in

[wait-until.ts:23](https://github.com/vercel/vercel/blob/main/packages/functions/src/wait-until.ts#L23)
