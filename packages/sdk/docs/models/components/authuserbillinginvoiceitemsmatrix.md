# AuthUserBillingInvoiceItemsMatrix

## Example Usage

```typescript
import { AuthUserBillingInvoiceItemsMatrix } from "@vercel/sdk/models/components";

let value: AuthUserBillingInvoiceItemsMatrix = {
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