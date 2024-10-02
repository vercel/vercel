# GetCheckTBT

## Example Usage

```typescript
import { GetCheckTBT } from "@vercel/sdk/models/operations/getcheck.js";

let value: GetCheckTBT = {
  value: 46.95,
  source: "web-vitals",
};
```

## Fields

| Field                                                                                                    | Type                                                                                                     | Required                                                                                                 | Description                                                                                              |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `value`                                                                                                  | *number*                                                                                                 | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `previousValue`                                                                                          | *number*                                                                                                 | :heavy_minus_sign:                                                                                       | N/A                                                                                                      |
| `source`                                                                                                 | [operations.GetCheckChecksResponse200Source](../../models/operations/getcheckchecksresponse200source.md) | :heavy_check_mark:                                                                                       | N/A                                                                                                      |