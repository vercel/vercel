# Artifacts

## Example Usage

```typescript
import { Artifacts } from "@vercel/sdk/models/components";

let value: Artifacts = {
  price: 7532.4,
  batch: 4901.1,
  threshold: 2358.34,
  hidden: false,
};
```

## Fields

| Field                                                                  | Type                                                                   | Required                                                               | Description                                                            |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `matrix`                                                               | [components.AuthUserMatrix](../../models/components/authusermatrix.md) | :heavy_minus_sign:                                                     | N/A                                                                    |
| `tier`                                                                 | *number*                                                               | :heavy_minus_sign:                                                     | N/A                                                                    |
| `price`                                                                | *number*                                                               | :heavy_check_mark:                                                     | N/A                                                                    |
| `batch`                                                                | *number*                                                               | :heavy_check_mark:                                                     | N/A                                                                    |
| `threshold`                                                            | *number*                                                               | :heavy_check_mark:                                                     | N/A                                                                    |
| `name`                                                                 | *string*                                                               | :heavy_minus_sign:                                                     | N/A                                                                    |
| `hidden`                                                               | *boolean*                                                              | :heavy_check_mark:                                                     | N/A                                                                    |
| `disabledAt`                                                           | *number*                                                               | :heavy_minus_sign:                                                     | N/A                                                                    |
| `enabledAt`                                                            | *number*                                                               | :heavy_minus_sign:                                                     | N/A                                                                    |