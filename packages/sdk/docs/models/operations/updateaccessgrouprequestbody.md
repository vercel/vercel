# UpdateAccessGroupRequestBody

## Example Usage

```typescript
import { UpdateAccessGroupRequestBody } from "@vercel/sdk/models/operations";

let value: UpdateAccessGroupRequestBody = {
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

| Field                                                        | Type                                                         | Required                                                     | Description                                                  | Example                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| `name`                                                       | *string*                                                     | :heavy_minus_sign:                                           | The name of the access group                                 | My access group                                              |
| `projects`                                                   | [operations.Projects](../../models/operations/projects.md)[] | :heavy_minus_sign:                                           | N/A                                                          |                                                              |
| `membersToAdd`                                               | *string*[]                                                   | :heavy_minus_sign:                                           | List of members to add to the access group.                  |                                                              |
| `membersToRemove`                                            | *string*[]                                                   | :heavy_minus_sign:                                           | List of members to remove from the access group.             |                                                              |