# GetTeamAccessRequestResponseBody

Successfully

## Example Usage

```typescript
import { GetTeamAccessRequestResponseBody } from "@vercel/sdk/models/operations";

let value: GetTeamAccessRequestResponseBody = {
  teamSlug: "my-team",
  teamName: "My Team",
  confirmed: false,
  joinedFrom: {
    origin: "gitlab",
  },
  accessRequestedAt: 1588720733602,
  github: {},
  gitlab: {},
  bitbucket: {},
};
```

## Fields

| Field                                                                                                  | Type                                                                                                   | Required                                                                                               | Description                                                                                            | Example                                                                                                |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `teamSlug`                                                                                             | *string*                                                                                               | :heavy_check_mark:                                                                                     | The slug of the team.                                                                                  | my-team                                                                                                |
| `teamName`                                                                                             | *string*                                                                                               | :heavy_check_mark:                                                                                     | The name of the team.                                                                                  | My Team                                                                                                |
| `confirmed`                                                                                            | *boolean*                                                                                              | :heavy_check_mark:                                                                                     | Current status of the membership. Will be `true` if confirmed, if pending it'll be `false`.            | false                                                                                                  |
| `joinedFrom`                                                                                           | [operations.GetTeamAccessRequestJoinedFrom](../../models/operations/getteamaccessrequestjoinedfrom.md) | :heavy_check_mark:                                                                                     | A map that describes the origin from where the user joined.                                            |                                                                                                        |
| `accessRequestedAt`                                                                                    | *number*                                                                                               | :heavy_check_mark:                                                                                     | Timestamp in milliseconds when the user requested access to the team.                                  | 1588720733602                                                                                          |
| `github`                                                                                               | [operations.GetTeamAccessRequestGithub](../../models/operations/getteamaccessrequestgithub.md)         | :heavy_check_mark:                                                                                     | Map of the connected GitHub account.                                                                   |                                                                                                        |
| `gitlab`                                                                                               | [operations.GetTeamAccessRequestGitlab](../../models/operations/getteamaccessrequestgitlab.md)         | :heavy_check_mark:                                                                                     | Map of the connected GitLab account.                                                                   |                                                                                                        |
| `bitbucket`                                                                                            | [operations.GetTeamAccessRequestBitbucket](../../models/operations/getteamaccessrequestbitbucket.md)   | :heavy_check_mark:                                                                                     | Map of the connected Bitbucket account.                                                                |                                                                                                        |