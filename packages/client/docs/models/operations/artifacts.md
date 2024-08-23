# Artifacts

## Example Usage

```typescript
import { Artifacts } from '@vercel/client/models/operations';

let value: Artifacts = {
  price: 3591.11,
  batch: 1855.18,
  threshold: 7088.98,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                       | Required           | Description |
| ------------ | -------------------------------------------------------------------------- | ------------------ | ----------- |
| `matrix`     | [operations.CreateTeamMatrix](../../models/operations/createteammatrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                                   | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                                   | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                                   | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                                   | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                                   | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                                  | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                                   | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                                   | :heavy_minus_sign: | N/A         |
