# UpdateCheckFCP

## Example Usage

```typescript
import { UpdateCheckFCP } from "@vercel/sdk/models/operations";

let value: UpdateCheckFCP = {
  value: 9589.5,
  source: "web-vitals",
};
```

## Fields

| Field                                                                                                    | Type                                                                                                     | Required                                                                                                 | Description                                                                                              |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `value`                                                                                                  | *number*                                                                                                 | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `previousValue`                                                                                          | *number*                                                                                                 | :heavy_minus_sign:                                                                                       | N/A                                                                                                      |
| `source`                                                                                                 | [operations.UpdateCheckChecksResponseSource](../../models/operations/updatecheckchecksresponsesource.md) | :heavy_check_mark:                                                                                       | N/A                                                                                                      |