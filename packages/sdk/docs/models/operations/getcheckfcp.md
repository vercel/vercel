# GetCheckFCP

## Example Usage

```typescript
import { GetCheckFCP } from "@vercel/sdk/models/operations/getcheck.js";

let value: GetCheckFCP = {
  value: 5232.48,
  source: "web-vitals",
};
```

## Fields

| Field                                                                  | Type                                                                   | Required                                                               | Description                                                            |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `value`                                                                | *number*                                                               | :heavy_check_mark:                                                     | N/A                                                                    |
| `previousValue`                                                        | *number*                                                               | :heavy_minus_sign:                                                     | N/A                                                                    |
| `source`                                                               | [operations.GetCheckSource](../../models/operations/getchecksource.md) | :heavy_check_mark:                                                     | N/A                                                                    |