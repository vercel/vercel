# CheckDomainPriceResponseBody

Successful response which returns the price of the domain and the period.

## Example Usage

```typescript
import { CheckDomainPriceResponseBody } from '@vercel/client/models/operations';

let value: CheckDomainPriceResponseBody = {
  price: 20,
  period: 1,
};
```

## Fields

| Field    | Type     | Required           | Description                                                       | Example |
| -------- | -------- | ------------------ | ----------------------------------------------------------------- | ------- |
| `price`  | _number_ | :heavy_check_mark: | The domain price in USD.                                          | 20      |
| `period` | _number_ | :heavy_check_mark: | The number of years the domain could be held before paying again. | 1       |
