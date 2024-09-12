# Metrics

Metrics about the page

## Example Usage

```typescript
import { Metrics } from "@vercel/sdk/models/operations";

let value: Metrics = {
  fcp: {
    value: 1200,
    previousValue: 900,
    source: "web-vitals",
  },
  lcp: {
    value: 1200,
    previousValue: 1000,
    source: "web-vitals",
  },
  cls: {
    value: 4,
    previousValue: 2,
    source: "web-vitals",
  },
  tbt: {
    value: 3000,
    previousValue: 3500,
    source: "web-vitals",
  },
  virtualExperienceScore: {
    value: 30,
    previousValue: 35,
    source: "web-vitals",
  },
};
```

## Fields

| Field                                                                                  | Type                                                                                   | Required                                                                               | Description                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `fcp`                                                                                  | [operations.Fcp](../../models/operations/fcp.md)                                       | :heavy_check_mark:                                                                     | N/A                                                                                    |
| `lcp`                                                                                  | [operations.Lcp](../../models/operations/lcp.md)                                       | :heavy_check_mark:                                                                     | N/A                                                                                    |
| `cls`                                                                                  | [operations.Cls](../../models/operations/cls.md)                                       | :heavy_check_mark:                                                                     | N/A                                                                                    |
| `tbt`                                                                                  | [operations.Tbt](../../models/operations/tbt.md)                                       | :heavy_check_mark:                                                                     | N/A                                                                                    |
| `virtualExperienceScore`                                                               | [operations.VirtualExperienceScore](../../models/operations/virtualexperiencescore.md) | :heavy_minus_sign:                                                                     | N/A                                                                                    |