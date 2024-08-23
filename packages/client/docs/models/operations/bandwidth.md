# Bandwidth

## Example Usage

```typescript
import { Bandwidth } from '@vercel/client/models/operations';

let value: Bandwidth = {
  price: 5326.69,
  batch: 5873.75,
  threshold: 3262.69,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                 | Required           | Description |
| ------------ | ------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `matrix`     | [operations.CreateTeamTeamsMatrix](../../models/operations/createteamteamsmatrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                             | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                             | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                             | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                             | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                             | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                            | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                             | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                             | :heavy_minus_sign: | N/A         |
