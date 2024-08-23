# GitNamespacesResponseBody

## Example Usage

```typescript
import { GitNamespacesResponseBody } from '@vercel/client/models/operations';

let value: GitNamespacesResponseBody = {
  provider: '<value>',
  slug: '<value>',
  id: '<value>',
  ownerType: '<value>',
};
```

## Fields

| Field                | Type            | Required           | Description |
| -------------------- | --------------- | ------------------ | ----------- |
| `provider`           | _string_        | :heavy_check_mark: | N/A         |
| `slug`               | _string_        | :heavy_check_mark: | N/A         |
| `id`                 | _operations.Id_ | :heavy_check_mark: | N/A         |
| `ownerType`          | _string_        | :heavy_check_mark: | N/A         |
| `name`               | _string_        | :heavy_minus_sign: | N/A         |
| `isAccessRestricted` | _boolean_       | :heavy_minus_sign: | N/A         |
| `installationId`     | _number_        | :heavy_minus_sign: | N/A         |
| `requireReauth`      | _boolean_       | :heavy_minus_sign: | N/A         |
