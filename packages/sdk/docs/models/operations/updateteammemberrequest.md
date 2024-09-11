# UpdateTeamMemberRequest

## Example Usage

```typescript
import { UpdateTeamMemberRequest } from "@vercel/sdk/models/operations";

let value: UpdateTeamMemberRequest = {
  teamId: "<value>",
  uid: "<value>",
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

| Field                                                                                            | Type                                                                                             | Required                                                                                         | Description                                                                                      |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `teamId`                                                                                         | *string*                                                                                         | :heavy_check_mark:                                                                               | N/A                                                                                              |
| `uid`                                                                                            | *string*                                                                                         | :heavy_check_mark:                                                                               | N/A                                                                                              |
| `requestBody`                                                                                    | [operations.UpdateTeamMemberRequestBody](../../models/operations/updateteammemberrequestbody.md) | :heavy_minus_sign:                                                                               | N/A                                                                                              |