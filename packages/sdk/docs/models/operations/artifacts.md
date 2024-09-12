# Artifacts

## Example Usage

```typescript
import { Artifacts } from "@vercel/sdk/models/operations";

let value: Artifacts = {
  price: 3165.42,
  batch: 2040.72,
  threshold: 4468.77,
  hidden: false,
};
```

## Fields

| Field                                                                      | Type                                                                       | Required                                                                   | Description                                                                |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `matrix`                                                                   | [operations.CreateTeamMatrix](../../models/operations/createteammatrix.md) | :heavy_minus_sign:                                                         | N/A                                                                        |
| `tier`                                                                     | *number*                                                                   | :heavy_minus_sign:                                                         | N/A                                                                        |
| `price`                                                                    | *number*                                                                   | :heavy_check_mark:                                                         | N/A                                                                        |
| `batch`                                                                    | *number*                                                                   | :heavy_check_mark:                                                         | N/A                                                                        |
| `threshold`                                                                | *number*                                                                   | :heavy_check_mark:                                                         | N/A                                                                        |
| `name`                                                                     | *string*                                                                   | :heavy_minus_sign:                                                         | N/A                                                                        |
| `hidden`                                                                   | *boolean*                                                                  | :heavy_check_mark:                                                         | N/A                                                                        |
| `disabledAt`                                                               | *number*                                                                   | :heavy_minus_sign:                                                         | N/A                                                                        |
| `enabledAt`                                                                | *number*                                                                   | :heavy_minus_sign:                                                         | N/A                                                                        |