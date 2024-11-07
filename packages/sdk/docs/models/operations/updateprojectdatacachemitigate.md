# UpdateProjectDataCacheMitigate

## Example Usage

```typescript
import { UpdateProjectDataCacheMitigate } from "@vercel/sdk/models/operations/updateprojectdatacache.js";

let value: UpdateProjectDataCacheMitigate = {
  action: "rate_limit",
  ruleId: "<id>",
};
```

## Fields

| Field                                                                                              | Type                                                                                               | Required                                                                                           | Description                                                                                        |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `action`                                                                                           | [operations.UpdateProjectDataCacheAction](../../models/operations/updateprojectdatacacheaction.md) | :heavy_check_mark:                                                                                 | N/A                                                                                                |
| `ruleId`                                                                                           | *string*                                                                                           | :heavy_check_mark:                                                                                 | N/A                                                                                                |
| `ttl`                                                                                              | *number*                                                                                           | :heavy_minus_sign:                                                                                 | N/A                                                                                                |
| `erl`                                                                                              | [operations.Erl](../../models/operations/erl.md)                                                   | :heavy_minus_sign:                                                                                 | N/A                                                                                                |