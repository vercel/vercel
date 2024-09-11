# ListAccessGroupsResponseBody2

## Example Usage

```typescript
import { ListAccessGroupsResponseBody2 } from "@vercel/sdk/models/operations";

let value: ListAccessGroupsResponseBody2 = {
  accessGroups: [
    {
      isDsyncManaged: false,
      name: "my-access-group",
      createdAt: "1588720733602",
      teamId: "team_123a6c5209bc3778245d011443644c8d27dc2c50",
      updatedAt: "1588720733602",
      accessGroupId: "ag_123a6c5209bc3778245d011443644c8d27dc2c50",
      membersCount: 5,
      projectsCount: 2,
    },
  ],
  pagination: {
    count: 7781.57,
    next: "<value>",
  },
};
```

## Fields

| Field                                                                                  | Type                                                                                   | Required                                                                               | Description                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `accessGroups`                                                                         | [operations.AccessGroups](../../models/operations/accessgroups.md)[]                   | :heavy_check_mark:                                                                     | N/A                                                                                    |
| `pagination`                                                                           | [operations.ResponseBodyPagination](../../models/operations/responsebodypagination.md) | :heavy_check_mark:                                                                     | N/A                                                                                    |