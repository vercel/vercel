# UpdateCheckMetrics

## Example Usage

```typescript
import { UpdateCheckMetrics } from "@vercel/sdk/models/operations/updatecheck.js";

let value: UpdateCheckMetrics = {
  fcp: {
    value: 5812.73,
    source: "web-vitals",
  },
  lcp: {
    value: 8817.35,
    source: "web-vitals",
  },
  cls: {
    value: 6925.32,
    source: "web-vitals",
  },
  tbt: {
    value: 7252.54,
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