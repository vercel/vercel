# BlobStores

## Example Usage

```typescript
import { BlobStores } from "@vercel/sdk/models/operations";

let value: BlobStores = {
  price: 3573.47,
  batch: 2982.64,
  threshold: 9149.71,
  hidden: false,
};
```

## Fields

| Field                                                                                                | Type                                                                                                 | Required                                                                                             | Description                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `matrix`                                                                                             | [operations.CreateTeamTeamsResponseMatrix](../../models/operations/createteamteamsresponsematrix.md) | :heavy_minus_sign:                                                                                   | N/A                                                                                                  |
| `tier`                                                                                               | *number*                                                                                             | :heavy_minus_sign:                                                                                   | N/A                                                                                                  |
| `price`                                                                                              | *number*                                                                                             | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `batch`                                                                                              | *number*                                                                                             | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `threshold`                                                                                          | *number*                                                                                             | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `name`                                                                                               | *string*                                                                                             | :heavy_minus_sign:                                                                                   | N/A                                                                                                  |
| `hidden`                                                                                             | *boolean*                                                                                            | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `disabledAt`                                                                                         | *number*                                                                                             | :heavy_minus_sign:                                                                                   | N/A                                                                                                  |
| `enabledAt`                                                                                          | *number*                                                                                             | :heavy_minus_sign:                                                                                   | N/A                                                                                                  |