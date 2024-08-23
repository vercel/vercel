# Repos

## Example Usage

```typescript
import { Repos } from '@vercel/client/models/operations';

let value: Repos = {
  id: 8783.73,
  provider: 'gitlab',
  url: 'https://difficult-wonder.org',
  name: '<value>',
  slug: '<value>',
  namespace: '<value>',
  owner: {
    id: 5796.81,
    name: '<value>',
  },
  ownerType: 'user',
  private: false,
  defaultBranch: '<value>',
  updatedAt: 4558.98,
};
```

## Fields

| Field           | Type                                                                                                   | Required           | Description |
| --------------- | ------------------------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `id`            | _operations.SearchRepoId_                                                                              | :heavy_check_mark: | N/A         |
| `provider`      | [operations.SearchRepoIntegrationsProvider](../../models/operations/searchrepointegrationsprovider.md) | :heavy_check_mark: | N/A         |
| `url`           | _string_                                                                                               | :heavy_check_mark: | N/A         |
| `name`          | _string_                                                                                               | :heavy_check_mark: | N/A         |
| `slug`          | _string_                                                                                               | :heavy_check_mark: | N/A         |
| `namespace`     | _string_                                                                                               | :heavy_check_mark: | N/A         |
| `owner`         | [operations.Owner](../../models/operations/owner.md)                                                   | :heavy_check_mark: | N/A         |
| `ownerType`     | [operations.OwnerType](../../models/operations/ownertype.md)                                           | :heavy_check_mark: | N/A         |
| `private`       | _boolean_                                                                                              | :heavy_check_mark: | N/A         |
| `defaultBranch` | _string_                                                                                               | :heavy_check_mark: | N/A         |
| `updatedAt`     | _number_                                                                                               | :heavy_check_mark: | N/A         |
