# UpdateTeamMemberRequestBody

## Example Usage

```typescript
import { UpdateTeamMemberRequestBody } from "@vercel/sdk/models/operations";

let value: UpdateTeamMemberRequestBody = {
  confirmed: true,
  role: "[\"MEMBER\",\"VIEWER\"]",
  projects: [
    {
      projectId: "prj_ndlgr43fadlPyCtREAqxxdyFK",
      role: "ADMIN",
    },
  ],
};
```

## Fields

| Field                                                                                          | Type                                                                                           | Required                                                                                       | Description                                                                                    | Example                                                                                        |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `confirmed`                                                                                    | *boolean*                                                                                      | :heavy_minus_sign:                                                                             | Accept a user who requested access to the team.                                                | true                                                                                           |
| `role`                                                                                         | *string*                                                                                       | :heavy_minus_sign:                                                                             | The role in the team of the member.                                                            | [<br/>"MEMBER",<br/>"VIEWER"<br/>]                                                             |
| `projects`                                                                                     | [operations.UpdateTeamMemberProjects](../../models/operations/updateteammemberprojects.md)[]   | :heavy_minus_sign:                                                                             | N/A                                                                                            |                                                                                                |
| `joinedFrom`                                                                                   | [operations.UpdateTeamMemberJoinedFrom](../../models/operations/updateteammemberjoinedfrom.md) | :heavy_minus_sign:                                                                             | N/A                                                                                            |                                                                                                |