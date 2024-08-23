# GetTeamAccessRequestJoinedFrom

A map that describes the origin from where the user joined.

## Example Usage

```typescript
import { GetTeamAccessRequestJoinedFrom } from '@vercel/client/models/operations';

let value: GetTeamAccessRequestJoinedFrom = {
  origin: 'github',
};
```

## Fields

| Field              | Type                                                                                           | Required           | Description |
| ------------------ | ---------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `origin`           | [operations.GetTeamAccessRequestOrigin](../../models/operations/getteamaccessrequestorigin.md) | :heavy_check_mark: | N/A         |
| `commitId`         | _string_                                                                                       | :heavy_minus_sign: | N/A         |
| `repoId`           | _string_                                                                                       | :heavy_minus_sign: | N/A         |
| `repoPath`         | _string_                                                                                       | :heavy_minus_sign: | N/A         |
| `gitUserId`        | _operations.GetTeamAccessRequestGitUserId_                                                     | :heavy_minus_sign: | N/A         |
| `gitUserLogin`     | _string_                                                                                       | :heavy_minus_sign: | N/A         |
| `ssoUserId`        | _string_                                                                                       | :heavy_minus_sign: | N/A         |
| `ssoConnectedAt`   | _number_                                                                                       | :heavy_minus_sign: | N/A         |
| `idpUserId`        | _string_                                                                                       | :heavy_minus_sign: | N/A         |
| `dsyncUserId`      | _string_                                                                                       | :heavy_minus_sign: | N/A         |
| `dsyncConnectedAt` | _number_                                                                                       | :heavy_minus_sign: | N/A         |
