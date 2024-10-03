# Bandwidth

## Example Usage

```typescript
import { Bandwidth } from "@vercel/sdk/models/components/authuser.js";

let value: Bandwidth = {
  price: 8866.83,
  batch: 8309.09,
  threshold: 316.05,
  hidden: false,
};
```

## Fields

| Field                                                                                | Type                                                                                 | Required                                                                             | Description                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `matrix`                                                                             | [components.AuthUserBillingMatrix](../../models/components/authuserbillingmatrix.md) | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `tier`                                                                               | *number*                                                                             | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `price`                                                                              | *number*                                                                             | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `batch`                                                                              | *number*                                                                             | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `threshold`                                                                          | *number*                                                                             | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `name`                                                                               | *string*                                                                             | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `hidden`                                                                             | *boolean*                                                                            | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `disabledAt`                                                                         | *number*                                                                             | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `enabledAt`                                                                          | *number*                                                                             | :heavy_minus_sign:                                                                   | N/A                                                                                  |