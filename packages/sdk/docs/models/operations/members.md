# Members

## Example Usage

```typescript
import { Members } from "@vercel/sdk/models/operations/listaccessgroupmembers.js";

let value: Members = {
  email: "Kenyon2@yahoo.com",
  uid: "<id>",
  username: "Orlando46",
  teamRole: "OWNER",
};
```

## Fields

| Field                                                      | Type                                                       | Required                                                   | Description                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `avatar`                                                   | *string*                                                   | :heavy_minus_sign:                                         | N/A                                                        |
| `email`                                                    | *string*                                                   | :heavy_check_mark:                                         | N/A                                                        |
| `uid`                                                      | *string*                                                   | :heavy_check_mark:                                         | N/A                                                        |
| `username`                                                 | *string*                                                   | :heavy_check_mark:                                         | N/A                                                        |
| `name`                                                     | *string*                                                   | :heavy_minus_sign:                                         | N/A                                                        |
| `createdAt`                                                | *string*                                                   | :heavy_minus_sign:                                         | N/A                                                        |
| `teamRole`                                                 | [operations.TeamRole](../../models/operations/teamrole.md) | :heavy_check_mark:                                         | N/A                                                        |