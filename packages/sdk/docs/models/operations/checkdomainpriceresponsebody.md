# CheckDomainPriceResponseBody

Successful response which returns the price of the domain and the period.

## Example Usage

```typescript
import { CheckDomainPriceResponseBody } from "@vercel/sdk/models/operations";

let value: CheckDomainPriceResponseBody = {
  price: 20,
  period: 1,
};
```

## Fields

| Field                                                             | Type                                                              | Required                                                          | Description                                                       | Example                                                           |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| `price`                                                           | *number*                                                          | :heavy_check_mark:                                                | The domain price in USD.                                          | 20                                                                |
| `period`                                                          | *number*                                                          | :heavy_check_mark:                                                | The number of years the domain could be held before paying again. | 1                                                                 |