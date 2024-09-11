# GetAllChecksTBT

## Example Usage

```typescript
import { GetAllChecksTBT } from "@vercel/sdk/models/operations";

let value: GetAllChecksTBT = {
  value: 6169.34,
  source: "web-vitals",
};
```

## Fields

| Field                                                                                                            | Type                                                                                                             | Required                                                                                                         | Description                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `value`                                                                                                          | *number*                                                                                                         | :heavy_check_mark:                                                                                               | N/A                                                                                                              |
| `previousValue`                                                                                                  | *number*                                                                                                         | :heavy_minus_sign:                                                                                               | N/A                                                                                                              |
| `source`                                                                                                         | [operations.GetAllChecksChecksResponse200Source](../../models/operations/getallcheckschecksresponse200source.md) | :heavy_check_mark:                                                                                               | N/A                                                                                                              |