# GetProjectMembersResponseBody2

Paginated list of members for the project.

## Example Usage

```typescript
import { GetProjectMembersResponseBody2 } from "@vercel/sdk/models/operations";

let value: GetProjectMembersResponseBody2 = {
  members: [
    {
      avatar: "123a6c5209bc3778245d011443644c8d27dc2c50",
      email: "jane.doe@example.com",
      role: "ADMIN",
      computedProjectRole: "ADMIN",
      uid: "zTuNVUXEAvvnNN3IaqinkyMw",
      username: "jane-doe",
      name: "Jane Doe",
      createdAt: 1588720733602,
      teamRole: "CONTRIBUTOR",
    },
  ],
  pagination: {
    hasNext: false,
    count: 20,
    next: 1540095775951,
    prev: 1540095775951,
  },
};
```

## Fields

| Field                                                                                                                    | Type                                                                                                                     | Required                                                                                                                 | Description                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `members`                                                                                                                | [operations.ResponseBodyMembers](../../models/operations/responsebodymembers.md)[]                                       | :heavy_check_mark:                                                                                                       | N/A                                                                                                                      |
| `pagination`                                                                                                             | [operations.GetProjectMembersResponseBodyPagination](../../models/operations/getprojectmembersresponsebodypagination.md) | :heavy_check_mark:                                                                                                       | N/A                                                                                                                      |