# Cls

## Example Usage

```typescript
import { Cls } from '@vercel/client/models/operations';

let value: Cls = {
  value: 4,
  previousValue: 2,
  source: 'web-vitals',
};
```

## Fields

| Field           | Type                                                                                                   | Required           | Description                                               | Example |
| --------------- | ------------------------------------------------------------------------------------------------------ | ------------------ | --------------------------------------------------------- | ------- |
| `value`         | _number_                                                                                               | :heavy_check_mark: | Cumulative Layout Shift value                             | 4       |
| `previousValue` | _number_                                                                                               | :heavy_minus_sign: | Previous Cumulative Layout Shift value to display a delta | 2       |
| `source`        | [operations.UpdateCheckChecksRequestSource](../../models/operations/updatecheckchecksrequestsource.md) | :heavy_check_mark: | N/A                                                       |         |
