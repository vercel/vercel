# Artifacts

## Example Usage

```typescript
import { Artifacts } from '@vercel/client/models/components';

let value: Artifacts = {
  price: 467.91,
  batch: 4894.59,
  threshold: 9980.26,
  hidden: false,
};
```

## Fields

| Field        | Type                                                                   | Required           | Description |
| ------------ | ---------------------------------------------------------------------- | ------------------ | ----------- |
| `matrix`     | [components.AuthUserMatrix](../../models/components/authusermatrix.md) | :heavy_minus_sign: | N/A         |
| `tier`       | _number_                                                               | :heavy_minus_sign: | N/A         |
| `price`      | _number_                                                               | :heavy_check_mark: | N/A         |
| `batch`      | _number_                                                               | :heavy_check_mark: | N/A         |
| `threshold`  | _number_                                                               | :heavy_check_mark: | N/A         |
| `name`       | _string_                                                               | :heavy_minus_sign: | N/A         |
| `hidden`     | _boolean_                                                              | :heavy_check_mark: | N/A         |
| `disabledAt` | _number_                                                               | :heavy_minus_sign: | N/A         |
| `enabledAt`  | _number_                                                               | :heavy_minus_sign: | N/A         |
