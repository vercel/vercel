# Proxy

## Example Usage

```typescript
import { Proxy } from '@vercel/client/models/operations';

let value: Proxy = {
  timestamp: 2572.33,
  method: '<value>',
  host: 'worst-genie.org',
  path: '/usr/X11R6',
  userAgent: ['<value>'],
  referer: '<value>',
  clientIp: '<value>',
  region: '<value>',
};
```

## Fields

| Field              | Type                                                             | Required           | Description |
| ------------------ | ---------------------------------------------------------------- | ------------------ | ----------- |
| `timestamp`        | _number_                                                         | :heavy_check_mark: | N/A         |
| `method`           | _string_                                                         | :heavy_check_mark: | N/A         |
| `host`             | _string_                                                         | :heavy_check_mark: | N/A         |
| `path`             | _string_                                                         | :heavy_check_mark: | N/A         |
| `statusCode`       | _number_                                                         | :heavy_minus_sign: | N/A         |
| `userAgent`        | _string_[]                                                       | :heavy_check_mark: | N/A         |
| `referer`          | _string_                                                         | :heavy_check_mark: | N/A         |
| `clientIp`         | _string_                                                         | :heavy_check_mark: | N/A         |
| `region`           | _string_                                                         | :heavy_check_mark: | N/A         |
| `scheme`           | _string_                                                         | :heavy_minus_sign: | N/A         |
| `responseByteSize` | _number_                                                         | :heavy_minus_sign: | N/A         |
| `cacheId`          | _string_                                                         | :heavy_minus_sign: | N/A         |
| `pathType`         | _string_                                                         | :heavy_minus_sign: | N/A         |
| `vercelId`         | _string_                                                         | :heavy_minus_sign: | N/A         |
| `vercelCache`      | [operations.VercelCache](../../models/operations/vercelcache.md) | :heavy_minus_sign: | N/A         |
| `lambdaRegion`     | _string_                                                         | :heavy_minus_sign: | N/A         |
| `wafAction`        | [operations.WafAction](../../models/operations/wafaction.md)     | :heavy_minus_sign: | N/A         |
| `wafRuleId`        | _string_                                                         | :heavy_minus_sign: | N/A         |
