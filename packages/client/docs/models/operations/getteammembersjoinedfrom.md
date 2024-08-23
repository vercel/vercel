# GetTeamMembersJoinedFrom

Map with information about the members origin if they joined by requesting access.

## Example Usage

```typescript
import { GetTeamMembersJoinedFrom } from '@vercel/client/models/operations';

let value: GetTeamMembersJoinedFrom = {
  origin: 'bitbucket',
};
```

## Fields

| Field              | Type                                                                               | Required           | Description |
| ------------------ | ---------------------------------------------------------------------------------- | ------------------ | ----------- |
| `origin`           | [operations.GetTeamMembersOrigin](../../models/operations/getteammembersorigin.md) | :heavy_check_mark: | N/A         |
| `commitId`         | _string_                                                                           | :heavy_minus_sign: | N/A         |
| `repoId`           | _string_                                                                           | :heavy_minus_sign: | N/A         |
| `repoPath`         | _string_                                                                           | :heavy_minus_sign: | N/A         |
| `gitUserId`        | _operations.GetTeamMembersGitUserId_                                               | :heavy_minus_sign: | N/A         |
| `gitUserLogin`     | _string_                                                                           | :heavy_minus_sign: | N/A         |
| `ssoUserId`        | _string_                                                                           | :heavy_minus_sign: | N/A         |
| `ssoConnectedAt`   | _number_                                                                           | :heavy_minus_sign: | N/A         |
| `idpUserId`        | _string_                                                                           | :heavy_minus_sign: | N/A         |
| `dsyncUserId`      | _string_                                                                           | :heavy_minus_sign: | N/A         |
| `dsyncConnectedAt` | _number_                                                                           | :heavy_minus_sign: | N/A         |
