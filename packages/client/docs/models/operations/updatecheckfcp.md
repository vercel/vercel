# UpdateCheckFCP

## Example Usage

```typescript
import { UpdateCheckFCP } from '@vercel/client/models/operations';

let value: UpdateCheckFCP = {
  value: 1020.44,
  source: 'web-vitals',
};
```

## Fields

| Field           | Type                                                                                                     | Required           | Description |
| --------------- | -------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `value`         | _number_                                                                                                 | :heavy_check_mark: | N/A         |
| `previousValue` | _number_                                                                                                 | :heavy_minus_sign: | N/A         |
| `source`        | [operations.UpdateCheckChecksResponseSource](../../models/operations/updatecheckchecksresponsesource.md) | :heavy_check_mark: | N/A         |
