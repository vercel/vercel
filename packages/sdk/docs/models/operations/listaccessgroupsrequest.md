# ListAccessGroupsRequest

## Example Usage

```typescript
import { ListAccessGroupsRequest } from "@vercel/sdk/models/operations";

let value: ListAccessGroupsRequest = {
  projectId: "prj_pavWOn1iLObbx3RowVvzmPrTWyTf",
  search: "example",
  membersLimit: 20,
  projectsLimit: 20,
  limit: 20,
};
```

## Fields

| Field                                                     | Type                                                      | Required                                                  | Description                                               | Example                                                   |
| --------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| `projectId`                                               | *string*                                                  | :heavy_minus_sign:                                        | Filter access groups by project.                          | prj_pavWOn1iLObbx3RowVvzmPrTWyTf                          |
| `search`                                                  | *string*                                                  | :heavy_minus_sign:                                        | Search for access groups by name.                         | example                                                   |
| `membersLimit`                                            | *number*                                                  | :heavy_minus_sign:                                        | Number of members to include in the response.             | 20                                                        |
| `projectsLimit`                                           | *number*                                                  | :heavy_minus_sign:                                        | Number of projects to include in the response.            | 20                                                        |
| `limit`                                                   | *number*                                                  | :heavy_minus_sign:                                        | Limit how many access group should be returned.           | 20                                                        |
| `next`                                                    | *string*                                                  | :heavy_minus_sign:                                        | Continuation cursor to retrieve the next page of results. |                                                           |
| `teamId`                                                  | *string*                                                  | :heavy_minus_sign:                                        | The Team identifier to perform the request on behalf of.  |                                                           |
| `slug`                                                    | *string*                                                  | :heavy_minus_sign:                                        | The Team slug to perform the request on behalf of.        |                                                           |