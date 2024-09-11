# ResponseBodyProxy

## Example Usage

```typescript
import { ResponseBodyProxy } from "@vercel/sdk/models/operations";

let value: ResponseBodyProxy = {
  timestamp: 9268.8,
  method: "<value>",
  host: "marvelous-stimulation.info",
  path: "/private/var",
  userAgent: [
    "<value>",
  ],
  referer: "<value>",
  clientIp: "<value>",
  region: "<value>",
};
```

## Fields

| Field                                                                                    | Type                                                                                     | Required                                                                                 | Description                                                                              |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `timestamp`                                                                              | *number*                                                                                 | :heavy_check_mark:                                                                       | N/A                                                                                      |
| `method`                                                                                 | *string*                                                                                 | :heavy_check_mark:                                                                       | N/A                                                                                      |
| `host`                                                                                   | *string*                                                                                 | :heavy_check_mark:                                                                       | N/A                                                                                      |
| `path`                                                                                   | *string*                                                                                 | :heavy_check_mark:                                                                       | N/A                                                                                      |
| `statusCode`                                                                             | *number*                                                                                 | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `userAgent`                                                                              | *string*[]                                                                               | :heavy_check_mark:                                                                       | N/A                                                                                      |
| `referer`                                                                                | *string*                                                                                 | :heavy_check_mark:                                                                       | N/A                                                                                      |
| `clientIp`                                                                               | *string*                                                                                 | :heavy_check_mark:                                                                       | N/A                                                                                      |
| `region`                                                                                 | *string*                                                                                 | :heavy_check_mark:                                                                       | N/A                                                                                      |
| `scheme`                                                                                 | *string*                                                                                 | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `responseByteSize`                                                                       | *number*                                                                                 | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `cacheId`                                                                                | *string*                                                                                 | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `pathType`                                                                               | *string*                                                                                 | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `vercelId`                                                                               | *string*                                                                                 | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `vercelCache`                                                                            | [operations.ResponseBodyVercelCache](../../models/operations/responsebodyvercelcache.md) | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `lambdaRegion`                                                                           | *string*                                                                                 | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `wafAction`                                                                              | [operations.ResponseBodyWafAction](../../models/operations/responsebodywafaction.md)     | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `wafRuleId`                                                                              | *string*                                                                                 | :heavy_minus_sign:                                                                       | N/A                                                                                      |