# AuthUserBillingMatrix

## Example Usage

```typescript
import { AuthUserBillingMatrix } from '@vercel/client/models/components';

let value: AuthUserBillingMatrix = {
  defaultUnitPrice: '<value>',
  dimensionPrices: {
    key: '<value>',
  },
};
```

## Fields

| Field              | Type                     | Required           | Description |
| ------------------ | ------------------------ | ------------------ | ----------- |
| `defaultUnitPrice` | _string_                 | :heavy_check_mark: | N/A         |
| `dimensionPrices`  | Record<string, _string_> | :heavy_check_mark: | N/A         |
