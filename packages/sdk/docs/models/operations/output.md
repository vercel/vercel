# Output

The results of the check Run

## Example Usage

```typescript
import { Output } from "@vercel/sdk/models/operations";

let value: Output = {
  metrics: {
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
  },
};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `metrics`                                                | [operations.Metrics](../../models/operations/metrics.md) | :heavy_minus_sign:                                       | Metrics about the page                                   |