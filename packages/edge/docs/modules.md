[@vercel/edge](README.md) / Exports

# @vercel/edge

## Table of contents

### Interfaces

- [Geo](interfaces/Geo.md)

### Type Aliases

- [ExtraResponseInit](modules.md#extraresponseinit)

### Variables

- [CITY_HEADER_NAME](modules.md#city_header_name)
- [COUNTRY_HEADER_NAME](modules.md#country_header_name)
- [IP_HEADER_NAME](modules.md#ip_header_name)
- [LATITUDE_HEADER_NAME](modules.md#latitude_header_name)
- [LONGITUDE_HEADER_NAME](modules.md#longitude_header_name)
- [REGION_HEADER_NAME](modules.md#region_header_name)

### Functions

- [geolocation](modules.md#geolocation)
- [ipAddress](modules.md#ipaddress)
- [next](modules.md#next)
- [rewrite](modules.md#rewrite)

## Type Aliases

### ExtraResponseInit

Ƭ **ExtraResponseInit**: `Omit`<`ResponseInit`, `"headers"`\> & { `headers?`: `HeadersInit` }

#### Defined in

[middleware-helpers.ts:1](https://github.com/vercel/vercel/blob/main/packages/edge/src/middleware-helpers.ts#L1)

## Variables

### CITY_HEADER_NAME

• `Const` **CITY_HEADER_NAME**: `"x-vercel-ip-city"`

City of the original client IP calculated by Vercel Proxy.

#### Defined in

[edge-headers.ts:4](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L4)

---

### COUNTRY_HEADER_NAME

• `Const` **COUNTRY_HEADER_NAME**: `"x-vercel-ip-country"`

Country of the original client IP calculated by Vercel Proxy.

#### Defined in

[edge-headers.ts:8](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L8)

---

### IP_HEADER_NAME

• `Const` **IP_HEADER_NAME**: `"x-real-ip"`

Ip from Vercel Proxy. Do not confuse it with the client Ip.

#### Defined in

[edge-headers.ts:12](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L12)

---

### LATITUDE_HEADER_NAME

• `Const` **LATITUDE_HEADER_NAME**: `"x-vercel-ip-latitude"`

Latitude of the original client IP calculated by Vercel Proxy.

#### Defined in

[edge-headers.ts:16](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L16)

---

### LONGITUDE_HEADER_NAME

• `Const` **LONGITUDE_HEADER_NAME**: `"x-vercel-ip-longitude"`

Longitude of the original client IP calculated by Vercel Proxy.

#### Defined in

[edge-headers.ts:20](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L20)

---

### REGION_HEADER_NAME

• `Const` **REGION_HEADER_NAME**: `"x-vercel-ip-country-region"`

Region of the original client IP calculated by Vercel Proxy.

#### Defined in

[edge-headers.ts:24](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L24)

## Functions

### geolocation

▸ **geolocation**(`request`): [`Geo`](interfaces/Geo.md)

Returns the location information from for the incoming request

**`See`**

- [CITY_HEADER_NAME](modules.md#city_header_name)
- [COUNTRY_HEADER_NAME](modules.md#country_header_name)
- [REGION_HEADER_NAME](modules.md#region_header_name)
- [LATITUDE_HEADER_NAME](modules.md#latitude_header_name)
- [LONGITUDE_HEADER_NAME](modules.md#longitude_header_name)

#### Parameters

| Name      | Type      |
| :-------- | :-------- |
| `request` | `Request` |

#### Returns

[`Geo`](interfaces/Geo.md)

#### Defined in

[edge-headers.ts:74](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L74)

---

### ipAddress

▸ **ipAddress**(`request`): `string` \| `undefined`

Returns the IP address of the request from the headers.

**`See`**

[IP_HEADER_NAME](modules.md#ip_header_name)

#### Parameters

| Name      | Type      |
| :-------- | :-------- |
| `request` | `Request` |

#### Returns

`string` \| `undefined`

#### Defined in

[edge-headers.ts:61](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L61)

---

### next

▸ **next**(`init?`): `Response`

This tells the Middleware to continue with the request.

#### Parameters

| Name    | Type                                                |
| :------ | :-------------------------------------------------- |
| `init?` | [`ExtraResponseInit`](modules.md#extraresponseinit) |

#### Returns

`Response`

#### Defined in

[middleware-helpers.ts:27](https://github.com/vercel/vercel/blob/main/packages/edge/src/middleware-helpers.ts#L27)

---

### rewrite

▸ **rewrite**(`destination`, `init?`): `Response`

Rewrite the request into a different URL.

#### Parameters

| Name          | Type                                                                      |
| :------------ | :------------------------------------------------------------------------ |
| `destination` | `string` \| [`URL`](https://developer.mozilla.org/en-US/docs/Web/API/URL) |
| `init?`       | [`ExtraResponseInit`](modules.md#extraresponseinit)                       |

#### Returns

`Response`

#### Defined in

[middleware-helpers.ts:12](https://github.com/vercel/vercel/blob/main/packages/edge/src/middleware-helpers.ts#L12)
