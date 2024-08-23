# CreateTeamMatrix

## Example Usage

```typescript
import { CreateTeamMatrix } from '@vercel/client/models/operations';

let value: CreateTeamMatrix = {
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
