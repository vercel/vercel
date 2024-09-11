# Proxy

## Example Usage

```typescript
import { Proxy } from "@vercel/sdk/models/operations";

let value: Proxy = {
  timestamp: 9854.92,
  method: "<value>",
  host: "helpless-warming.net",
  path: "/var",
  userAgent: [
    "<value>",
  ],
  referer: "<value>",
  clientIp: "<value>",
  region: "<value>",
};
```

## Fields

| Field                                                            | Type                                                             | Required                                                         | Description                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `timestamp`                                                      | *number*                                                         | :heavy_check_mark:                                               | N/A                                                              |
| `method`                                                         | *string*                                                         | :heavy_check_mark:                                               | N/A                                                              |
| `host`                                                           | *string*                                                         | :heavy_check_mark:                                               | N/A                                                              |
| `path`                                                           | *string*                                                         | :heavy_check_mark:                                               | N/A                                                              |
| `statusCode`                                                     | *number*                                                         | :heavy_minus_sign:                                               | N/A                                                              |
| `userAgent`                                                      | *string*[]                                                       | :heavy_check_mark:                                               | N/A                                                              |
| `referer`                                                        | *string*                                                         | :heavy_check_mark:                                               | N/A                                                              |
| `clientIp`                                                       | *string*                                                         | :heavy_check_mark:                                               | N/A                                                              |
| `region`                                                         | *string*                                                         | :heavy_check_mark:                                               | N/A                                                              |
| `scheme`                                                         | *string*                                                         | :heavy_minus_sign:                                               | N/A                                                              |
| `responseByteSize`                                               | *number*                                                         | :heavy_minus_sign:                                               | N/A                                                              |
| `cacheId`                                                        | *string*                                                         | :heavy_minus_sign:                                               | N/A                                                              |
| `pathType`                                                       | *string*                                                         | :heavy_minus_sign:                                               | N/A                                                              |
| `vercelId`                                                       | *string*                                                         | :heavy_minus_sign:                                               | N/A                                                              |
| `vercelCache`                                                    | [operations.VercelCache](../../models/operations/vercelcache.md) | :heavy_minus_sign:                                               | N/A                                                              |
| `lambdaRegion`                                                   | *string*                                                         | :heavy_minus_sign:                                               | N/A                                                              |
| `wafAction`                                                      | [operations.WafAction](../../models/operations/wafaction.md)     | :heavy_minus_sign:                                               | N/A                                                              |
| `wafRuleId`                                                      | *string*                                                         | :heavy_minus_sign:                                               | N/A                                                              |