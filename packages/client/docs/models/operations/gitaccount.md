# GitAccount

## Example Usage

```typescript
import { GitAccount } from '@vercel/client/models/operations';

let value: GitAccount = {
  provider: 'bitbucket',
  namespaceId: '<value>',
};
```

## Fields

| Field         | Type                                                                           | Required           | Description |
| ------------- | ------------------------------------------------------------------------------ | ------------------ | ----------- |
| `provider`    | [operations.SearchRepoProvider](../../models/operations/searchrepoprovider.md) | :heavy_check_mark: | N/A         |
| `namespaceId` | _operations.NamespaceId_                                                       | :heavy_check_mark: | N/A         |
