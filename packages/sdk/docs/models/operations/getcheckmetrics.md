# GetCheckMetrics

## Example Usage

```typescript
import { GetCheckMetrics } from "@vercel/sdk/models/operations/getcheck.js";

let value: GetCheckMetrics = {
  fcp: {
    value: 2700.08,
    source: "web-vitals",
  },
  lcp: {
    value: 7351.94,
    source: "web-vitals",
  },
  cls: {
    value: 9621.89,
    source: "web-vitals",
  },
  tbt: {
    value: 2487.53,
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