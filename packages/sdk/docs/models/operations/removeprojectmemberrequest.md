# RemoveProjectMemberRequest

## Example Usage

```typescript
import { RemoveProjectMemberRequest } from "@vercel/sdk/models/operations";

let value: RemoveProjectMemberRequest = {
  idOrName: "prj_pavWOn1iLObbXLRiwVvzmPrTWyTf",
  uid: "ndlgr43fadlPyCtREAqxxdyFK",
};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              | Example                                                  |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `idOrName`                                               | *string*                                                 | :heavy_check_mark:                                       | The ID or name of the Project.                           | prj_pavWOn1iLObbXLRiwVvzmPrTWyTf                         |
| `uid`                                                    | *string*                                                 | :heavy_check_mark:                                       | The user ID of the member.                               | ndlgr43fadlPyCtREAqxxdyFK                                |
| `teamId`                                                 | *string*                                                 | :heavy_minus_sign:                                       | The Team identifier to perform the request on behalf of. |                                                          |
| `slug`                                                   | *string*                                                 | :heavy_minus_sign:                                       | The Team slug to perform the request on behalf of.       |                                                          |