# JoinedFrom

## Example Usage

```typescript
import { JoinedFrom } from "@vercel/sdk/models/operations";

let value: JoinedFrom = {
  origin: "github",
  commitId: "f498d25d8bd654b578716203be73084b31130cd7",
  repoId: "67753070",
  repoPath: "jane-doe/example",
  gitUserId: 103053343,
  gitUserLogin: "jane-doe",
};
```

## Fields

| Field                                                               | Type                                                                | Required                                                            | Description                                                         | Example                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `origin`                                                            | [operations.Origin](../../models/operations/origin.md)              | :heavy_check_mark:                                                  | The origin of the request.                                          | github                                                              |
| `commitId`                                                          | *string*                                                            | :heavy_minus_sign:                                                  | The commit sha if the origin is a git provider.                     | f498d25d8bd654b578716203be73084b31130cd7                            |
| `repoId`                                                            | *string*                                                            | :heavy_minus_sign:                                                  | The ID of the repository for the given Git provider.                | 67753070                                                            |
| `repoPath`                                                          | *string*                                                            | :heavy_minus_sign:                                                  | The path to the repository for the given Git provider.              | jane-doe/example                                                    |
| `gitUserId`                                                         | *operations.GitUserId*                                              | :heavy_minus_sign:                                                  | The ID of the Git account of the user who requests access.          | 103053343                                                           |
| `gitUserLogin`                                                      | *string*                                                            | :heavy_minus_sign:                                                  | The login name for the Git account of the user who requests access. | jane-doe                                                            |