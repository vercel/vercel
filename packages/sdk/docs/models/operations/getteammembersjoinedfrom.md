# GetTeamMembersJoinedFrom

Map with information about the members origin if they joined by requesting access.

## Example Usage

```typescript
import { GetTeamMembersJoinedFrom } from "@vercel/sdk/models/operations";

let value: GetTeamMembersJoinedFrom = {
  origin: "saml",
};
```

## Fields

| Field                                                                              | Type                                                                               | Required                                                                           | Description                                                                        |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `origin`                                                                           | [operations.GetTeamMembersOrigin](../../models/operations/getteammembersorigin.md) | :heavy_check_mark:                                                                 | N/A                                                                                |
| `commitId`                                                                         | *string*                                                                           | :heavy_minus_sign:                                                                 | N/A                                                                                |
| `repoId`                                                                           | *string*                                                                           | :heavy_minus_sign:                                                                 | N/A                                                                                |
| `repoPath`                                                                         | *string*                                                                           | :heavy_minus_sign:                                                                 | N/A                                                                                |
| `gitUserId`                                                                        | *operations.GetTeamMembersGitUserId*                                               | :heavy_minus_sign:                                                                 | N/A                                                                                |
| `gitUserLogin`                                                                     | *string*                                                                           | :heavy_minus_sign:                                                                 | N/A                                                                                |
| `ssoUserId`                                                                        | *string*                                                                           | :heavy_minus_sign:                                                                 | N/A                                                                                |
| `ssoConnectedAt`                                                                   | *number*                                                                           | :heavy_minus_sign:                                                                 | N/A                                                                                |
| `idpUserId`                                                                        | *string*                                                                           | :heavy_minus_sign:                                                                 | N/A                                                                                |
| `dsyncUserId`                                                                      | *string*                                                                           | :heavy_minus_sign:                                                                 | N/A                                                                                |
| `dsyncConnectedAt`                                                                 | *number*                                                                           | :heavy_minus_sign:                                                                 | N/A                                                                                |