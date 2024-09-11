# CreateProjectErl

## Example Usage

```typescript
import { CreateProjectErl } from "@vercel/sdk/models/operations";

let value: CreateProjectErl = {
  algo: "fixed_window",
  window: 1469.46,
  limit: 8828.6,
  keys: [
    "<value>",
  ],
};
```

## Fields

| Field                                                                        | Type                                                                         | Required                                                                     | Description                                                                  |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `algo`                                                                       | [operations.CreateProjectAlgo](../../models/operations/createprojectalgo.md) | :heavy_check_mark:                                                           | N/A                                                                          |
| `window`                                                                     | *number*                                                                     | :heavy_check_mark:                                                           | N/A                                                                          |
| `limit`                                                                      | *number*                                                                     | :heavy_check_mark:                                                           | N/A                                                                          |
| `keys`                                                                       | *string*[]                                                                   | :heavy_check_mark:                                                           | N/A                                                                          |