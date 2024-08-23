# Erl

## Example Usage

```typescript
import { Erl } from '@vercel/client/models/operations';

let value: Erl = {
  algo: 'token_bucket',
  window: 6601.74,
  limit: 2879.91,
  keys: ['<value>'],
};
```

## Fields

| Field    | Type                                               | Required           | Description |
| -------- | -------------------------------------------------- | ------------------ | ----------- |
| `algo`   | [operations.Algo](../../models/operations/algo.md) | :heavy_check_mark: | N/A         |
| `window` | _number_                                           | :heavy_check_mark: | N/A         |
| `limit`  | _number_                                           | :heavy_check_mark: | N/A         |
| `keys`   | _string_[]                                         | :heavy_check_mark: | N/A         |
