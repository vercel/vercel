# RequestAccessToTeamResponseBody

Successfuly requested access to the team.

## Example Usage

```typescript
import { RequestAccessToTeamResponseBody } from "@vercel/sdk/models/operations";

let value: RequestAccessToTeamResponseBody = {
  teamSlug: "<value>",
  teamName: "<value>",
  github: {},
  gitlab: {},
  bitbucket: {},
};
```

## Fields

| Field                                                                                                | Type                                                                                                 | Required                                                                                             | Description                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `teamSlug`                                                                                           | *string*                                                                                             | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `teamName`                                                                                           | *string*                                                                                             | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `confirmed`                                                                                          | *boolean*                                                                                            | :heavy_minus_sign:                                                                                   | N/A                                                                                                  |
| `joinedFrom`                                                                                         | [operations.RequestAccessToTeamJoinedFrom](../../models/operations/requestaccesstoteamjoinedfrom.md) | :heavy_minus_sign:                                                                                   | N/A                                                                                                  |
| `accessRequestedAt`                                                                                  | *number*                                                                                             | :heavy_minus_sign:                                                                                   | N/A                                                                                                  |
| `github`                                                                                             | [operations.Github](../../models/operations/github.md)                                               | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `gitlab`                                                                                             | [operations.Gitlab](../../models/operations/gitlab.md)                                               | :heavy_check_mark:                                                                                   | N/A                                                                                                  |
| `bitbucket`                                                                                          | [operations.Bitbucket](../../models/operations/bitbucket.md)                                         | :heavy_check_mark:                                                                                   | N/A                                                                                                  |