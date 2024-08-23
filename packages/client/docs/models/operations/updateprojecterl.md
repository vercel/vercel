# UpdateProjectErl

## Example Usage

```typescript
import { UpdateProjectErl } from '@vercel/client/models/operations';

let value: UpdateProjectErl = {
  algo: 'fixed_window',
  window: 4541.62,
  limit: 559.65,
  keys: ['<value>'],
};
```

## Fields

| Field    | Type                                                                         | Required           | Description |
| -------- | ---------------------------------------------------------------------------- | ------------------ | ----------- |
| `algo`   | [operations.UpdateProjectAlgo](../../models/operations/updateprojectalgo.md) | :heavy_check_mark: | N/A         |
| `window` | _number_                                                                     | :heavy_check_mark: | N/A         |
| `limit`  | _number_                                                                     | :heavy_check_mark: | N/A         |
| `keys`   | _string_[]                                                                   | :heavy_check_mark: | N/A         |
