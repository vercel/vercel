# GetCheckLCP

## Example Usage

```typescript
import { GetCheckLCP } from "@vercel/sdk/models/operations/getcheck.js";

let value: GetCheckLCP = {
  value: 201.08,
  source: "web-vitals",
};
```

## Fields

| Field                                                                              | Type                                                                               | Required                                                                           | Description                                                                        |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `value`                                                                            | *number*                                                                           | :heavy_check_mark:                                                                 | N/A                                                                                |
| `previousValue`                                                                    | *number*                                                                           | :heavy_minus_sign:                                                                 | N/A                                                                                |
| `source`                                                                           | [operations.GetCheckChecksSource](../../models/operations/getcheckcheckssource.md) | :heavy_check_mark:                                                                 | N/A                                                                                |