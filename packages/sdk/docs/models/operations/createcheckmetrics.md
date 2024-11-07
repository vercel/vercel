# CreateCheckMetrics

## Example Usage

```typescript
import { CreateCheckMetrics } from "@vercel/sdk/models/operations/createcheck.js";

let value: CreateCheckMetrics = {
  fcp: {
    value: 1965.82,
    source: "web-vitals",
  },
  lcp: {
    value: 3687.25,
    source: "web-vitals",
  },
  cls: {
    value: 8209.93,
    source: "web-vitals",
  },
  tbt: {
    value: 971.01,
    source: "web-vitals",
  },
};
```

## Fields

| Field                                                                                                        | Type                                                                                                         | Required                                                                                                     | Description                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `fcp`                                                                                                        | [operations.CreateCheckFCP](../../models/operations/createcheckfcp.md)                                       | :heavy_check_mark:                                                                                           | N/A                                                                                                          |
| `lcp`                                                                                                        | [operations.CreateCheckLCP](../../models/operations/createchecklcp.md)                                       | :heavy_check_mark:                                                                                           | N/A                                                                                                          |
| `cls`                                                                                                        | [operations.CreateCheckCLS](../../models/operations/createcheckcls.md)                                       | :heavy_check_mark:                                                                                           | N/A                                                                                                          |
| `tbt`                                                                                                        | [operations.CreateCheckTBT](../../models/operations/createchecktbt.md)                                       | :heavy_check_mark:                                                                                           | N/A                                                                                                          |
| `virtualExperienceScore`                                                                                     | [operations.CreateCheckVirtualExperienceScore](../../models/operations/createcheckvirtualexperiencescore.md) | :heavy_minus_sign:                                                                                           | N/A                                                                                                          |