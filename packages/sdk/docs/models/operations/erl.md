# Erl

## Example Usage

```typescript
import { Erl } from "@vercel/sdk/models/operations/updateprojectdatacache.js";

let value: Erl = {
  algo: "fixed_window",
  window: 9493.19,
  limit: 9413.78,
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