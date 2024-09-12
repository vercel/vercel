# ListAccessGroupMembersResponseBody

## Example Usage

```typescript
import { ListAccessGroupMembersResponseBody } from "@vercel/sdk/models/operations";

let value: ListAccessGroupMembersResponseBody = {
  members: [
    {
      email: "Kenyon_Huel7@yahoo.com",
      uid: "<value>",
      username: "Ettie.Bogisich",
      teamRole: "DEVELOPER",
    },
  ],
  pagination: {
    count: 8326.2,
    next: "<value>",
  },
};
```

## Fields

| Field                                                          | Type                                                           | Required                                                       | Description                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `members`                                                      | [operations.Members](../../models/operations/members.md)[]     | :heavy_check_mark:                                             | N/A                                                            |
| `pagination`                                                   | [operations.Pagination](../../models/operations/pagination.md) | :heavy_check_mark:                                             | N/A                                                            |