# BlobStores

## Example Usage

```typescript
import { BlobStores } from '@vercel/client/models/operations';

let value: BlobStores = {
  price: 8095.94,
  batch: 3165.42,
  threshold: 2040.72,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                                                 | Required           | Description |
| ------------ | ---------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `matrix`     | [operations.CreateTeamTeamsResponseMatrix](../../models/operations/createteamteamsresponsematrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                                             | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                                             | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                                             | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                                             | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                                             | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                                            | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                                             | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                                             | :heavy_minus_sign: | N/A         |
