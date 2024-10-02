# Bandwidth

## Example Usage

```typescript
import { Bandwidth } from "@vercel/sdk/models/operations/createteam.js";

let value: Bandwidth = {
  price: 252.32,
  batch: 2715.50,
  threshold: 4618.53,
  hidden: false,
};
```

## Fields

| Field                                                                                | Type                                                                                 | Required                                                                             | Description                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `matrix`                                                                             | [operations.CreateTeamTeamsMatrix](../../models/operations/createteamteamsmatrix.md) | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `tier`                                                                               | *number*                                                                             | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `price`                                                                              | *number*                                                                             | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `batch`                                                                              | *number*                                                                             | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `threshold`                                                                          | *number*                                                                             | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `name`                                                                               | *string*                                                                             | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `hidden`                                                                             | *boolean*                                                                            | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `disabledAt`                                                                         | *number*                                                                             | :heavy_minus_sign:                                                                   | N/A                                                                                  |
| `enabledAt`                                                                          | *number*                                                                             | :heavy_minus_sign:                                                                   | N/A                                                                                  |