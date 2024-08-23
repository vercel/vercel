# Two

## Example Usage

```typescript
import { Two } from '@vercel/client/models/operations';

let value: Two = {
  org: '<value>',
  ref: '<value>',
  repo: '<value>',
  type: 'github',
};
```

## Fields

| Field  | Type                                                                 | Required           | Description |
| ------ | -------------------------------------------------------------------- | ------------------ | ----------- |
| `org`  | _string_                                                             | :heavy_check_mark: | N/A         |
| `ref`  | _string_                                                             | :heavy_check_mark: | N/A         |
| `repo` | _string_                                                             | :heavy_check_mark: | N/A         |
| `sha`  | _string_                                                             | :heavy_minus_sign: | N/A         |
| `type` | [operations.GitSourceType](../../models/operations/gitsourcetype.md) | :heavy_check_mark: | N/A         |
