@vercel/edge

# @vercel/edge

## Table of contents

### Interfaces

- [ExtraResponseInit](interfaces/ExtraResponseInit.md)
- [Geo](interfaces/Geo.md)

### Variables

- [CITY_HEADER_NAME](README.md#city_header_name)
- [COUNTRY_HEADER_NAME](README.md#country_header_name)
- [IP_HEADER_NAME](README.md#ip_header_name)
- [LATITUDE_HEADER_NAME](README.md#latitude_header_name)
- [LONGITUDE_HEADER_NAME](README.md#longitude_header_name)
- [REGION_HEADER_NAME](README.md#region_header_name)

### Functions

- [geolocation](README.md#geolocation)
- [ipAddress](README.md#ipaddress)
- [next](README.md#next)
- [rewrite](README.md#rewrite)

## Variables

### CITY_HEADER_NAME

• `Const` **CITY_HEADER_NAME**: `"x-vercel-ip-city"`

City of the original client IP calculated by Vercel Proxy.

#### Defined in

[src/edge-headers.ts:4](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L4)

---

### COUNTRY_HEADER_NAME

• `Const` **COUNTRY_HEADER_NAME**: `"x-vercel-ip-country"`

Country of the original client IP calculated by Vercel Proxy.

#### Defined in

[src/edge-headers.ts:8](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L8)

---

### IP_HEADER_NAME

• `Const` **IP_HEADER_NAME**: `"x-real-ip"`

Ip from Vercel Proxy. Do not confuse it with the client Ip.

#### Defined in

[src/edge-headers.ts:12](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L12)

---

### LATITUDE_HEADER_NAME

• `Const` **LATITUDE_HEADER_NAME**: `"x-vercel-ip-latitude"`

Latitude of the original client IP calculated by Vercel Proxy.

#### Defined in

[src/edge-headers.ts:16](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L16)

---

### LONGITUDE_HEADER_NAME

• `Const` **LONGITUDE_HEADER_NAME**: `"x-vercel-ip-longitude"`

Longitude of the original client IP calculated by Vercel Proxy.

#### Defined in

[src/edge-headers.ts:20](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L20)

---

### REGION_HEADER_NAME

• `Const` **REGION_HEADER_NAME**: `"x-vercel-ip-country-region"`

Region of the original client IP calculated by Vercel Proxy.

#### Defined in

[src/edge-headers.ts:24](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L24)

## Functions

### geolocation

▸ **geolocation**(`request`): [`Geo`](interfaces/Geo.md)

Returns the location information from for the incoming request

**`See`**

- [CITY_HEADER_NAME](README.md#city_header_name)
- [COUNTRY_HEADER_NAME](README.md#country_header_name)
- [REGION_HEADER_NAME](README.md#region_header_name)
- [LATITUDE_HEADER_NAME](README.md#latitude_header_name)
- [LONGITUDE_HEADER_NAME](README.md#longitude_header_name)

#### Parameters

| Name      | Type      | Description                                              |
| :-------- | :-------- | :------------------------------------------------------- |
| `request` | `Request` | The incoming request object to grab the geolocation data |

#### Returns

[`Geo`](interfaces/Geo.md)

#### Defined in

[src/edge-headers.ts:76](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L76)

---

### ipAddress

▸ **ipAddress**(`request`): `string` \| `undefined`

Returns the IP address of the request from the headers.

**`See`**

[IP_HEADER_NAME](README.md#ip_header_name)

#### Parameters

| Name      | Type      | Description                                     |
| :-------- | :-------- | :---------------------------------------------- |
| `request` | `Request` | The incoming request object to grab the IP from |

#### Returns

`string` \| `undefined`

#### Defined in

[src/edge-headers.ts:62](https://github.com/vercel/vercel/blob/main/packages/edge/src/edge-headers.ts#L62)

---

### next

▸ **next**(`init?`): `Response`

Continue with the request without changing the URL

#### Parameters

| Name    | Type                                                   | Description                         |
| :------ | :----------------------------------------------------- | :---------------------------------- |
| `init?` | [`ExtraResponseInit`](interfaces/ExtraResponseInit.md) | additional options for the response |

#### Returns

`Response`

#### Defined in

[src/middleware-helpers.ts:32](https://github.com/vercel/vercel/blob/main/packages/edge/src/middleware-helpers.ts#L32)

---

### rewrite

▸ **rewrite**(`destination`, `init?`): `Response`

Rewrite the request into a different URL.

#### Parameters

| Name          | Type                                                                      | Description                           |
| :------------ | :------------------------------------------------------------------------ | :------------------------------------ |
| `destination` | `string` \| [`URL`](https://developer.mozilla.org/en-US/docs/Web/API/URL) | the new URL to rewrite the request to |
| `init?`       | [`ExtraResponseInit`](interfaces/ExtraResponseInit.md)                    | additional options for the response   |

#### Returns

`Response`

#### Defined in

[src/middleware-helpers.ts:15](https://github.com/vercel/vercel/blob/main/packages/edge/src/middleware-helpers.ts#L15)
