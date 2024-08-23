# GetAllChecksLCP

## Example Usage

```typescript
import { GetAllChecksLCP } from '@vercel/client/models/operations';

let value: GetAllChecksLCP = {
  value: 2223.21,
  source: 'web-vitals',
};
```

## Fields

| Field           | Type                                                                                       | Required           | Description |
| --------------- | ------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `value`         | _number_                                                                                   | :heavy_check_mark: | N/A         |
| `previousValue` | _number_                                                                                   | :heavy_minus_sign: | N/A         |
| `source`        | [operations.GetAllChecksChecksSource](../../models/operations/getallcheckscheckssource.md) | :heavy_check_mark: | N/A         |
