# GetAllChecksMetrics

## Example Usage

```typescript
import { GetAllChecksMetrics } from '@vercel/client/models/operations';

let value: GetAllChecksMetrics = {
  fcp: {
    value: 9025.99,
    source: 'web-vitals',
  },
  lcp: {
    value: 6818.2,
    source: 'web-vitals',
  },
  cls: {
    value: 4499.5,
    source: 'web-vitals',
  },
  tbt: {
    value: 3595.08,
    source: 'web-vitals',
  },
};
```

## Fields

| Field                    | Type                                                                                                           | Required           | Description |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `fcp`                    | [operations.GetAllChecksFCP](../../models/operations/getallchecksfcp.md)                                       | :heavy_check_mark: | N/A         |
| `lcp`                    | [operations.GetAllChecksLCP](../../models/operations/getallcheckslcp.md)                                       | :heavy_check_mark: | N/A         |
| `cls`                    | [operations.GetAllChecksCLS](../../models/operations/getallcheckscls.md)                                       | :heavy_check_mark: | N/A         |
| `tbt`                    | [operations.GetAllChecksTBT](../../models/operations/getallcheckstbt.md)                                       | :heavy_check_mark: | N/A         |
| `virtualExperienceScore` | [operations.GetAllChecksVirtualExperienceScore](../../models/operations/getallchecksvirtualexperiencescore.md) | :heavy_minus_sign: | N/A         |
