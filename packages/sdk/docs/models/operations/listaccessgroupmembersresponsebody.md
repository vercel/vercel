# ListAccessGroupMembersResponseBody

## Example Usage

```typescript
import { ListAccessGroupMembersResponseBody } from "@vercel/sdk/models/operations/listaccessgroupmembers.js";

let value: ListAccessGroupMembersResponseBody = {
  members: [
    {
      email: "Pinkie.Sauer63@hotmail.com",
      uid: "<id>",
      username: "Tyrel.Johns",
      teamRole: "BILLING",
    },
  ],
  pagination: {
    count: 187.90,
    next: "<value>",
  },
};
```

## Fields

| Field                                                          | Type                                                           | Required                                                       | Description                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `members`                                                      | [operations.Members](../../models/operations/members.md)[]     | :heavy_check_mark:                                             | N/A                                                            |
| `pagination`                                                   | [operations.Pagination](../../models/operations/pagination.md) | :heavy_check_mark:                                             | N/A                                                            |