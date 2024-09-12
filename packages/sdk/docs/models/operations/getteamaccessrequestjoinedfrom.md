# GetTeamAccessRequestJoinedFrom

A map that describes the origin from where the user joined.

## Example Usage

```typescript
import { GetTeamAccessRequestJoinedFrom } from "@vercel/sdk/models/operations";

let value: GetTeamAccessRequestJoinedFrom = {
  origin: "bitbucket",
};
```

## Fields

| Field                                                                                          | Type                                                                                           | Required                                                                                       | Description                                                                                    |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `origin`                                                                                       | [operations.GetTeamAccessRequestOrigin](../../models/operations/getteamaccessrequestorigin.md) | :heavy_check_mark:                                                                             | N/A                                                                                            |
| `commitId`                                                                                     | *string*                                                                                       | :heavy_minus_sign:                                                                             | N/A                                                                                            |
| `repoId`                                                                                       | *string*                                                                                       | :heavy_minus_sign:                                                                             | N/A                                                                                            |
| `repoPath`                                                                                     | *string*                                                                                       | :heavy_minus_sign:                                                                             | N/A                                                                                            |
| `gitUserId`                                                                                    | *operations.GetTeamAccessRequestGitUserId*                                                     | :heavy_minus_sign:                                                                             | N/A                                                                                            |
| `gitUserLogin`                                                                                 | *string*                                                                                       | :heavy_minus_sign:                                                                             | N/A                                                                                            |
| `ssoUserId`                                                                                    | *string*                                                                                       | :heavy_minus_sign:                                                                             | N/A                                                                                            |
| `ssoConnectedAt`                                                                               | *number*                                                                                       | :heavy_minus_sign:                                                                             | N/A                                                                                            |
| `idpUserId`                                                                                    | *string*                                                                                       | :heavy_minus_sign:                                                                             | N/A                                                                                            |
| `dsyncUserId`                                                                                  | *string*                                                                                       | :heavy_minus_sign:                                                                             | N/A                                                                                            |
| `dsyncConnectedAt`                                                                             | *number*                                                                                       | :heavy_minus_sign:                                                                             | N/A                                                                                            |