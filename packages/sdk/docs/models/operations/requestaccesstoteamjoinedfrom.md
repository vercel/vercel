# RequestAccessToTeamJoinedFrom

## Example Usage

```typescript
import { RequestAccessToTeamJoinedFrom } from "@vercel/sdk/models/operations";

let value: RequestAccessToTeamJoinedFrom = {
  origin: "saml",
};
```

## Fields

| Field                                                                                        | Type                                                                                         | Required                                                                                     | Description                                                                                  |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `origin`                                                                                     | [operations.RequestAccessToTeamOrigin](../../models/operations/requestaccesstoteamorigin.md) | :heavy_check_mark:                                                                           | N/A                                                                                          |
| `commitId`                                                                                   | *string*                                                                                     | :heavy_minus_sign:                                                                           | N/A                                                                                          |
| `repoId`                                                                                     | *string*                                                                                     | :heavy_minus_sign:                                                                           | N/A                                                                                          |
| `repoPath`                                                                                   | *string*                                                                                     | :heavy_minus_sign:                                                                           | N/A                                                                                          |
| `gitUserId`                                                                                  | *operations.RequestAccessToTeamGitUserId*                                                    | :heavy_minus_sign:                                                                           | N/A                                                                                          |
| `gitUserLogin`                                                                               | *string*                                                                                     | :heavy_minus_sign:                                                                           | N/A                                                                                          |
| `ssoUserId`                                                                                  | *string*                                                                                     | :heavy_minus_sign:                                                                           | N/A                                                                                          |
| `ssoConnectedAt`                                                                             | *number*                                                                                     | :heavy_minus_sign:                                                                           | N/A                                                                                          |
| `idpUserId`                                                                                  | *string*                                                                                     | :heavy_minus_sign:                                                                           | N/A                                                                                          |
| `dsyncUserId`                                                                                | *string*                                                                                     | :heavy_minus_sign:                                                                           | N/A                                                                                          |
| `dsyncConnectedAt`                                                                           | *number*                                                                                     | :heavy_minus_sign:                                                                           | N/A                                                                                          |