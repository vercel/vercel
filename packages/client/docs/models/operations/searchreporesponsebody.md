# SearchRepoResponseBody

## Example Usage

```typescript
import { SearchRepoResponseBody } from '@vercel/client/models/operations';

let value: SearchRepoResponseBody = {
  gitAccount: {
    provider: 'gitlab',
    namespaceId: 3763.89,
  },
  repos: [
    {
      id: '<value>',
      provider: 'github-custom-host',
      url: 'https://faint-carnation.info',
      name: '<value>',
      slug: '<value>',
      namespace: '<value>',
      owner: {
        id: '<value>',
        name: '<value>',
      },
      ownerType: 'team',
      private: false,
      defaultBranch: '<value>',
      updatedAt: 5140.54,
    },
  ],
};
```

## Fields

| Field        | Type                                                           | Required           | Description |
| ------------ | -------------------------------------------------------------- | ------------------ | ----------- |
| `gitAccount` | [operations.GitAccount](../../models/operations/gitaccount.md) | :heavy_check_mark: | N/A         |
| `repos`      | [operations.Repos](../../models/operations/repos.md)[]         | :heavy_check_mark: | N/A         |
