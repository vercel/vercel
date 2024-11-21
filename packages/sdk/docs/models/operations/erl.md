# Erl

## Example Usage

```typescript
import { Erl } from "@vercel/sdk/models/operations/updateprojectdatacache.js";

let value: Erl = {
  algo: "token_bucket",
  window: 3381.59,
  limit: 9615.70,
  keys: [
    "<value>",
  ],
};
```

## Fields

| Field                                                                                          | Type                                                                                           | Required                                                                                       | Description                                                                                    |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `algo`                                                                                         | [operations.UpdateProjectDataCacheAlgo](../../models/operations/updateprojectdatacachealgo.md) | :heavy_check_mark:                                                                             | N/A                                                                                            |
| `window`                                                                                       | *number*                                                                                       | :heavy_check_mark:                                                                             | N/A                                                                                            |
| `limit`                                                                                        | *number*                                                                                       | :heavy_check_mark:                                                                             | N/A                                                                                            |
| `keys`                                                                                         | *string*[]                                                                                     | :heavy_check_mark:                                                                             | N/A                                                                                            |