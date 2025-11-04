[**@vercel/edge**](../README.md)

---

# Function: geolocation()

> **geolocation**(`request`): [`Geo`](../interfaces/Geo.md)

Defined in: packages/functions/headers.d.ts:125

Returns the location information for the incoming request.

## Parameters

### request

[`Request`](../interfaces/Request.md)

The incoming request object which provides the geolocation data

## Returns

[`Geo`](../interfaces/Geo.md)

The location information of the request, in this way:

```json
{
 "city": "New York",
 "country": "US",
 "flag": "🇺🇸",
 "countryRegion": "NY",
 "region": "iad1",
 "latitude": "40.7128",
 "longitude": "-74.0060"
 "postalCode": "10001"
}
```

## Example

```js
import { geolocation } from '@vercel/functions';

export function GET(request) {
  const details = geolocation(request);
  return Response.json(details);
}
```
