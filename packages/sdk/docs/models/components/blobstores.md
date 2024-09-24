# BlobStores

## Example Usage

```typescript
import { BlobStores } from "@vercel/sdk/models/components/authuser.js";

let value: BlobStores = {
  price: 54.95,
  batch: 2762.48,
  threshold: 3626.93,
  hidden: false,
};
```

## Fields

| Field                                                                                                        | Type                                                                                                         | Required                                                                                                     | Description                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `matrix`                                                                                                     | [components.AuthUserBillingInvoiceItemsMatrix](../../models/components/authuserbillinginvoiceitemsmatrix.md) | :heavy_minus_sign:                                                                                           | N/A                                                                                                          |
| `tier`                                                                                                       | *number*                                                                                                     | :heavy_minus_sign:                                                                                           | N/A                                                                                                          |
| `price`                                                                                                      | *number*                                                                                                     | :heavy_check_mark:                                                                                           | N/A                                                                                                          |
| `batch`                                                                                                      | *number*                                                                                                     | :heavy_check_mark:                                                                                           | N/A                                                                                                          |
| `threshold`                                                                                                  | *number*                                                                                                     | :heavy_check_mark:                                                                                           | N/A                                                                                                          |
| `name`                                                                                                       | *string*                                                                                                     | :heavy_minus_sign:                                                                                           | N/A                                                                                                          |
| `hidden`                                                                                                     | *boolean*                                                                                                    | :heavy_check_mark:                                                                                           | N/A                                                                                                          |
| `disabledAt`                                                                                                 | *number*                                                                                                     | :heavy_minus_sign:                                                                                           | N/A                                                                                                          |
| `enabledAt`                                                                                                  | *number*                                                                                                     | :heavy_minus_sign:                                                                                           | N/A                                                                                                          |