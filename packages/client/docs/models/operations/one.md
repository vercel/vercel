# One

## Example Usage

```typescript
import { One } from '@vercel/client/models/operations';

let value: One = {
  ref: '<value>',
  repoId: 2790.68,
  type: 'github',
};
```

## Fields

| Field    | Type                                               | Required           | Description |
| -------- | -------------------------------------------------- | ------------------ | ----------- |
| `ref`    | _string_                                           | :heavy_check_mark: | N/A         |
| `repoId` | _operations.RepoId_                                | :heavy_check_mark: | N/A         |
| `sha`    | _string_                                           | :heavy_minus_sign: | N/A         |
| `type`   | [operations.Type](../../models/operations/type.md) | :heavy_check_mark: | N/A         |
