# GetCheckMetrics

## Example Usage

```typescript
import { GetCheckMetrics } from "@vercel/sdk/models/operations/getcheck.js";

let value: GetCheckMetrics = {
  fcp: {
    value: 6674.10,
    source: "web-vitals",
  },
  lcp: {
    value: 1317.98,
    source: "web-vitals",
  },
  cls: {
    value: 7163.27,
    source: "web-vitals",
  },
  tbt: {
    value: 2894.06,
    source: "web-vitals",
  },
};
```

## Fields

| Field                                                                                                  | Type                                                                                                   | Required                                                                                               | Description                                                                                            |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `fcp`                                                                                                  | [operations.GetCheckFCP](../../models/operations/getcheckfcp.md)                                       | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `lcp`                                                                                                  | [operations.GetCheckLCP](../../models/operations/getchecklcp.md)                                       | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `cls`                                                                                                  | [operations.GetCheckCLS](../../models/operations/getcheckcls.md)                                       | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `tbt`                                                                                                  | [operations.GetCheckTBT](../../models/operations/getchecktbt.md)                                       | :heavy_check_mark:                                                                                     | N/A                                                                                                    |
| `virtualExperienceScore`                                                                               | [operations.GetCheckVirtualExperienceScore](../../models/operations/getcheckvirtualexperiencescore.md) | :heavy_minus_sign:                                                                                     | N/A                                                                                                    |