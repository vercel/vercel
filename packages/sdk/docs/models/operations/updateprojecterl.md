# UpdateProjectErl

## Example Usage

```typescript
import { UpdateProjectErl } from "@vercel/sdk/models/operations/updateproject.js";

let value: UpdateProjectErl = {
  algo: "fixed_window",
  window: 5221.76,
  limit: 8536.06,
  keys: [
    "<value>",
  ],
};
```

## Fields

| Field                                                                        | Type                                                                         | Required                                                                     | Description                                                                  |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `algo`                                                                       | [operations.UpdateProjectAlgo](../../models/operations/updateprojectalgo.md) | :heavy_check_mark:                                                           | N/A                                                                          |
| `window`                                                                     | *number*                                                                     | :heavy_check_mark:                                                           | N/A                                                                          |
| `limit`                                                                      | *number*                                                                     | :heavy_check_mark:                                                           | N/A                                                                          |
| `keys`                                                                       | *string*[]                                                                   | :heavy_check_mark:                                                           | N/A                                                                          |