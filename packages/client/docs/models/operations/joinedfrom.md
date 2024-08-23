# JoinedFrom

## Example Usage

```typescript
import { JoinedFrom } from '@vercel/client/models/operations';

let value: JoinedFrom = {
  origin: 'github',
  commitId: 'f498d25d8bd654b578716203be73084b31130cd7',
  repoId: '67753070',
  repoPath: 'jane-doe/example',
  gitUserId: 103053343,
  gitUserLogin: 'jane-doe',
};
```

## Fields

| Field          | Type                                                   | Required           | Description                                                         | Example                                  |
| -------------- | ------------------------------------------------------ | ------------------ | ------------------------------------------------------------------- | ---------------------------------------- |
| `origin`       | [operations.Origin](../../models/operations/origin.md) | :heavy_check_mark: | The origin of the request.                                          | github                                   |
| `commitId`     | _string_                                               | :heavy_minus_sign: | The commit sha if the origin is a git provider.                     | f498d25d8bd654b578716203be73084b31130cd7 |
| `repoId`       | _string_                                               | :heavy_minus_sign: | The ID of the repository for the given Git provider.                | 67753070                                 |
| `repoPath`     | _string_                                               | :heavy_minus_sign: | The path to the repository for the given Git provider.              | jane-doe/example                         |
| `gitUserId`    | _operations.GitUserId_                                 | :heavy_minus_sign: | The ID of the Git account of the user who requests access.          | 103053343                                |
| `gitUserLogin` | _string_                                               | :heavy_minus_sign: | The login name for the Git account of the user who requests access. | jane-doe                                 |
