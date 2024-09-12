# GetProjectMembersRequest

## Example Usage

```typescript
import { GetProjectMembersRequest } from "@vercel/sdk/models/operations";

let value: GetProjectMembersRequest = {
  idOrName: "prj_pavWOn1iLObbXLRiwVvzmPrTWyTf",
  limit: 20,
  since: 1540095775951,
  until: 1540095775951,
};
```

## Fields

| Field                                                               | Type                                                                | Required                                                            | Description                                                         | Example                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `idOrName`                                                          | *string*                                                            | :heavy_check_mark:                                                  | The ID or name of the Project.                                      | prj_pavWOn1iLObbXLRiwVvzmPrTWyTf                                    |
| `limit`                                                             | *number*                                                            | :heavy_minus_sign:                                                  | Limit how many project members should be returned                   | 20                                                                  |
| `since`                                                             | *number*                                                            | :heavy_minus_sign:                                                  | Timestamp in milliseconds to only include members added since then. | 1540095775951                                                       |
| `until`                                                             | *number*                                                            | :heavy_minus_sign:                                                  | Timestamp in milliseconds to only include members added until then. | 1540095775951                                                       |
| `search`                                                            | *string*                                                            | :heavy_minus_sign:                                                  | Search project members by their name, username, and email.          |                                                                     |
| `teamId`                                                            | *string*                                                            | :heavy_minus_sign:                                                  | The Team identifier to perform the request on behalf of.            |                                                                     |
| `slug`                                                              | *string*                                                            | :heavy_minus_sign:                                                  | The Team slug to perform the request on behalf of.                  |                                                                     |