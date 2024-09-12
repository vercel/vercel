# CreateCheckMetrics

## Example Usage

```typescript
import { CreateCheckMetrics } from "@vercel/sdk/models/operations";

let value: CreateCheckMetrics = {
  fcp: {
    value: 7369.18,
    source: "web-vitals",
  },
  lcp: {
    value: 4561.5,
    source: "web-vitals",
  },
  cls: {
    value: 2165.5,
    source: "web-vitals",
  },
  tbt: {
    value: 5684.34,
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