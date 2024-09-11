# GetCheckTBT

## Example Usage

```typescript
import { GetCheckTBT } from "@vercel/sdk/models/operations";

let value: GetCheckTBT = {
  value: 2103.82,
  source: "web-vitals",
};
```

## Fields

| Field                                                                                                    | Type                                                                                                     | Required                                                                                                 | Description                                                                                              |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `value`                                                                                                  | *number*                                                                                                 | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `previousValue`                                                                                          | *number*                                                                                                 | :heavy_minus_sign:                                                                                       | N/A                                                                                                      |
| `source`                                                                                                 | [operations.GetCheckChecksResponse200Source](../../models/operations/getcheckchecksresponse200source.md) | :heavy_check_mark:                                                                                       | N/A                                                                                                      |