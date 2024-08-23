# GetProjectsErl

## Example Usage

```typescript
import { GetProjectsErl } from '@vercel/client/models/operations';

let value: GetProjectsErl = {
  algo: 'fixed_window',
  window: 9044.25,
  limit: 3834.64,
  keys: ['<value>'],
};
```

## Fields

| Field    | Type                                                                     | Required           | Description |
| -------- | ------------------------------------------------------------------------ | ------------------ | ----------- |
| `algo`   | [operations.GetProjectsAlgo](../../models/operations/getprojectsalgo.md) | :heavy_check_mark: | N/A         |
| `window` | _number_                                                                 | :heavy_check_mark: | N/A         |
| `limit`  | _number_                                                                 | :heavy_check_mark: | N/A         |
| `keys`   | _string_[]                                                               | :heavy_check_mark: | N/A         |
