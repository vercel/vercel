# InviteUserToTeamRequest

## Example Usage

```typescript
import { InviteUserToTeamRequest } from "@vercel/sdk/models/operations";

let value: InviteUserToTeamRequest = {
  teamId: "<value>",
  requestBody: {
    uid: "kr1PsOIzqEL5Xg6M4VZcZosf",
    email: "john@example.com",
    role: "OWNER",
    projects: [
      {
        projectId: "prj_ndlgr43fadlPyCtREAqxxdyFK",
        role: "ADMIN",
      },
    ],
  },
};
```

## Fields

| Field                                                                                            | Type                                                                                             | Required                                                                                         | Description                                                                                      |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `teamId`                                                                                         | *string*                                                                                         | :heavy_check_mark:                                                                               | N/A                                                                                              |
| `requestBody`                                                                                    | [operations.InviteUserToTeamRequestBody](../../models/operations/inviteusertoteamrequestbody.md) | :heavy_minus_sign:                                                                               | N/A                                                                                              |