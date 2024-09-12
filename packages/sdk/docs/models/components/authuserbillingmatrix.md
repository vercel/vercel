# AuthUserBillingMatrix

## Example Usage

```typescript
import { AuthUserBillingMatrix } from "@vercel/sdk/models/components";

let value: AuthUserBillingMatrix = {
  defaultUnitPrice: "<value>",
  dimensionPrices: {
    "key": "<value>",
  },
};
```

## Fields

| Field                    | Type                     | Required                 | Description              |
| ------------------------ | ------------------------ | ------------------------ | ------------------------ |
| `defaultUnitPrice`       | *string*                 | :heavy_check_mark:       | N/A                      |
| `dimensionPrices`        | Record<string, *string*> | :heavy_check_mark:       | N/A                      |