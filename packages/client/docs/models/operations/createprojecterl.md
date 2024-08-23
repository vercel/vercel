# CreateProjectErl

## Example Usage

```typescript
import { CreateProjectErl } from '@vercel/client/models/operations';

let value: CreateProjectErl = {
  algo: 'fixed_window',
  window: 1469.46,
  limit: 8828.6,
  keys: ['<value>'],
};
```

## Fields

| Field    | Type                                                                         | Required           | Description |
| -------- | ---------------------------------------------------------------------------- | ------------------ | ----------- |
| `algo`   | [operations.CreateProjectAlgo](../../models/operations/createprojectalgo.md) | :heavy_check_mark: | N/A         |
| `window` | _number_                                                                     | :heavy_check_mark: | N/A         |
| `limit`  | _number_                                                                     | :heavy_check_mark: | N/A         |
| `keys`   | _string_[]                                                                   | :heavy_check_mark: | N/A         |
