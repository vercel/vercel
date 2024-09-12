# UpdateCheckMetrics

## Example Usage

```typescript
import { UpdateCheckMetrics } from "@vercel/sdk/models/operations";

let value: UpdateCheckMetrics = {
  fcp: {
    value: 1613.09,
    source: "web-vitals",
  },
  lcp: {
    value: 9953,
    source: "web-vitals",
  },
  cls: {
    value: 6531.08,
    source: "web-vitals",
  },
  tbt: {
    value: 5818.5,
    source: "web-vitals",
  },
};
```

## Fields

| Field                                                                                                        | Type                                                                                                         | Required                                                                                                     | Description                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `fcp`                                                                                                        | [operations.UpdateCheckFCP](../../models/operations/updatecheckfcp.md)                                       | :heavy_check_mark:                                                                                           | N/A                                                                                                          |
| `lcp`                                                                                                        | [operations.UpdateCheckLCP](../../models/operations/updatechecklcp.md)                                       | :heavy_check_mark:                                                                                           | N/A                                                                                                          |
| `cls`                                                                                                        | [operations.UpdateCheckCLS](../../models/operations/updatecheckcls.md)                                       | :heavy_check_mark:                                                                                           | N/A                                                                                                          |
| `tbt`                                                                                                        | [operations.UpdateCheckTBT](../../models/operations/updatechecktbt.md)                                       | :heavy_check_mark:                                                                                           | N/A                                                                                                          |
| `virtualExperienceScore`                                                                                     | [operations.UpdateCheckVirtualExperienceScore](../../models/operations/updatecheckvirtualexperiencescore.md) | :heavy_minus_sign:                                                                                           | N/A                                                                                                          |