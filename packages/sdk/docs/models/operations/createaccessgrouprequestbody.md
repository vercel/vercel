# CreateAccessGroupRequestBody

## Example Usage

```typescript
import { CreateAccessGroupRequestBody } from "@vercel/sdk/models/operations";

let value: CreateAccessGroupRequestBody = {
  name: "My access group",
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
| `name`                                                                                         | *string*                                                                                       | :heavy_check_mark:                                                                             | The name of the access group                                                                   | My access group                                                                                |
| `projects`                                                                                     | [operations.CreateAccessGroupProjects](../../models/operations/createaccessgroupprojects.md)[] | :heavy_minus_sign:                                                                             | N/A                                                                                            |                                                                                                |
| `membersToAdd`                                                                                 | *string*[]                                                                                     | :heavy_minus_sign:                                                                             | List of members to add to the access group.                                                    |                                                                                                |