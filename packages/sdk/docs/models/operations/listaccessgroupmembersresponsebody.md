# ListAccessGroupMembersResponseBody

## Example Usage

```typescript
import { ListAccessGroupMembersResponseBody } from "@vercel/sdk/models/operations/listaccessgroupmembers.js";

let value: ListAccessGroupMembersResponseBody = {
  members: [
    {
      email: "Rita_Strosin@gmail.com",
      uid: "<id>",
      username: "Osborne.Nikolaus",
      teamRole: "DEVELOPER",
    },
  ],
  pagination: {
    count: 2645.56,
    next: "<value>",
  },
};
```

## Fields

| Field                                                          | Type                                                           | Required                                                       | Description                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `members`                                                      | [operations.Members](../../models/operations/members.md)[]     | :heavy_check_mark:                                             | N/A                                                            |
| `pagination`                                                   | [operations.Pagination](../../models/operations/pagination.md) | :heavy_check_mark:                                             | N/A                                                            |