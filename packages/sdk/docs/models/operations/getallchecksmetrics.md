# GetAllChecksMetrics

## Example Usage

```typescript
import { GetAllChecksMetrics } from "@vercel/sdk/models/operations/getallchecks.js";

let value: GetAllChecksMetrics = {
  fcp: {
    value: 6048.46,
    source: "web-vitals",
  },
  lcp: {
    value: 7392.64,
    source: "web-vitals",
  },
  cls: {
    value: 391.88,
    source: "web-vitals",
  },
  tbt: {
    value: 2828.07,
    source: "web-vitals",
  },
};
```

## Fields

| Field                                                                                                          | Type                                                                                                           | Required                                                                                                       | Description                                                                                                    |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `fcp`                                                                                                          | [operations.GetAllChecksFCP](../../models/operations/getallchecksfcp.md)                                       | :heavy_check_mark:                                                                                             | N/A                                                                                                            |
| `lcp`                                                                                                          | [operations.GetAllChecksLCP](../../models/operations/getallcheckslcp.md)                                       | :heavy_check_mark:                                                                                             | N/A                                                                                                            |
| `cls`                                                                                                          | [operations.GetAllChecksCLS](../../models/operations/getallcheckscls.md)                                       | :heavy_check_mark:                                                                                             | N/A                                                                                                            |
| `tbt`                                                                                                          | [operations.GetAllChecksTBT](../../models/operations/getallcheckstbt.md)                                       | :heavy_check_mark:                                                                                             | N/A                                                                                                            |
| `virtualExperienceScore`                                                                                       | [operations.GetAllChecksVirtualExperienceScore](../../models/operations/getallchecksvirtualexperiencescore.md) | :heavy_minus_sign:                                                                                             | N/A                                                                                                            |