# ListAccessGroupMembersRequest

## Example Usage

```typescript
import { ListAccessGroupMembersRequest } from "@vercel/sdk/models/operations";

let value: ListAccessGroupMembersRequest = {
  idOrName: "ag_pavWOn1iLObbXLRiwVvzmPrTWyTf",
  limit: 20,
};
```

## Fields

| Field                                                      | Type                                                       | Required                                                   | Description                                                | Example                                                    |
| ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `idOrName`                                                 | *string*                                                   | :heavy_check_mark:                                         | The ID or name of the Access Group.                        | ag_pavWOn1iLObbXLRiwVvzmPrTWyTf                            |
| `limit`                                                    | *number*                                                   | :heavy_minus_sign:                                         | Limit how many access group members should be returned.    | 20                                                         |
| `next`                                                     | *string*                                                   | :heavy_minus_sign:                                         | Continuation cursor to retrieve the next page of results.  |                                                            |
| `search`                                                   | *string*                                                   | :heavy_minus_sign:                                         | Search project members by their name, username, and email. |                                                            |
| `teamId`                                                   | *string*                                                   | :heavy_minus_sign:                                         | The Team identifier to perform the request on behalf of.   |                                                            |
| `slug`                                                     | *string*                                                   | :heavy_minus_sign:                                         | The Team slug to perform the request on behalf of.         |                                                            |