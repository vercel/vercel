# Artifacts

## Example Usage

```typescript
import { Artifacts } from "@vercel/sdk/models/operations/createteam.js";

let value: Artifacts = {
  price: 2681.09,
  batch: 1315.97,
  threshold: 392.11,
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