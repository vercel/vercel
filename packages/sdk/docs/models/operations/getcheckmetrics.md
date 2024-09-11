# GetCheckMetrics

## Example Usage

```typescript
import { GetCheckMetrics } from "@vercel/sdk/models/operations";

let value: GetCheckMetrics = {
  fcp: {
    value: 1289.26,
    source: "web-vitals",
  },
  lcp: {
    value: 7506.86,
    source: "web-vitals",
  },
  cls: {
    value: 3154.28,
    source: "web-vitals",
  },
  tbt: {
    value: 6078.31,
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