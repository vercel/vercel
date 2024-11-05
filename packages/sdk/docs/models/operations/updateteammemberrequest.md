# UpdateTeamMemberRequest

## Example Usage

```typescript
import { UpdateTeamMemberRequest } from "@vercel/sdk/models/operations/updateteammember.js";

let value: UpdateTeamMemberRequest = {
  uid: "ndfasllgPyCtREAqxxdyFKb",
  teamId: "<id>",
  requestBody: {
    confirmed: true,
    role: "[\"MEMBER\",\"VIEWER\"]",
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

| Field                                                                                            | Type                                                                                             | Required                                                                                         | Description                                                                                      | Example                                                                                          |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `uid`                                                                                            | *string*                                                                                         | :heavy_check_mark:                                                                               | The ID of the member.                                                                            | ndfasllgPyCtREAqxxdyFKb                                                                          |
| `teamId`                                                                                         | *string*                                                                                         | :heavy_check_mark:                                                                               | N/A                                                                                              |                                                                                                  |
| `requestBody`                                                                                    | [operations.UpdateTeamMemberRequestBody](../../models/operations/updateteammemberrequestbody.md) | :heavy_minus_sign:                                                                               | N/A                                                                                              |                                                                                                  |