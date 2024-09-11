# GetCheckCLS

## Example Usage

```typescript
import { GetCheckCLS } from "@vercel/sdk/models/operations";

let value: GetCheckCLS = {
  value: 1709.09,
  source: "web-vitals",
};
```

## Fields

| Field                                                                                              | Type                                                                                               | Required                                                                                           | Description                                                                                        |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `value`                                                                                            | *number*                                                                                           | :heavy_check_mark:                                                                                 | N/A                                                                                                |
| `previousValue`                                                                                    | *number*                                                                                           | :heavy_minus_sign:                                                                                 | N/A                                                                                                |
| `source`                                                                                           | [operations.GetCheckChecksResponseSource](../../models/operations/getcheckchecksresponsesource.md) | :heavy_check_mark:                                                                                 | N/A                                                                                                |