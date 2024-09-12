# CreateTeamMatrix

## Example Usage

```typescript
import { CreateTeamMatrix } from "@vercel/sdk/models/operations";

let value: CreateTeamMatrix = {
  defaultUnitPrice: "<value>",
  dimensionPrices: {
    "key": "<value>",
  },
};
```

## Fields

| Field                    | Type                     | Required                 | Description              |
| ------------------------ | ------------------------ | ------------------------ | ------------------------ |
| `defaultUnitPrice`       | *string*                 | :heavy_check_mark:       | N/A                      |
| `dimensionPrices`        | Record<string, *string*> | :heavy_check_mark:       | N/A                      |