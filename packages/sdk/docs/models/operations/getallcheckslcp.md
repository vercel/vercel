# GetAllChecksLCP

## Example Usage

```typescript
import { GetAllChecksLCP } from "@vercel/sdk/models/operations/getallchecks.js";

let value: GetAllChecksLCP = {
  value: 1187.28,
  source: "web-vitals",
};
```

## Fields

| Field                                                                                      | Type                                                                                       | Required                                                                                   | Description                                                                                |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `value`                                                                                    | *number*                                                                                   | :heavy_check_mark:                                                                         | N/A                                                                                        |
| `previousValue`                                                                            | *number*                                                                                   | :heavy_minus_sign:                                                                         | N/A                                                                                        |
| `source`                                                                                   | [operations.GetAllChecksChecksSource](../../models/operations/getallcheckscheckssource.md) | :heavy_check_mark:                                                                         | N/A                                                                                        |