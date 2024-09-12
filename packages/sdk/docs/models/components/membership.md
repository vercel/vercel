# Membership

The membership of the authenticated User in relation to the Team.

## Example Usage

```typescript
import { Membership } from "@vercel/sdk/models/components";

let value: Membership = {};
```

## Fields

| Field                                                          | Type                                                           | Required                                                       | Description                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `confirmed`                                                    | *boolean*                                                      | :heavy_minus_sign:                                             | N/A                                                            |
| `confirmedAt`                                                  | *number*                                                       | :heavy_minus_sign:                                             | N/A                                                            |
| `accessRequestedAt`                                            | *number*                                                       | :heavy_minus_sign:                                             | N/A                                                            |
| `role`                                                         | [components.Role](../../models/components/role.md)             | :heavy_minus_sign:                                             | N/A                                                            |
| `teamId`                                                       | *string*                                                       | :heavy_minus_sign:                                             | N/A                                                            |
| `createdAt`                                                    | *number*                                                       | :heavy_minus_sign:                                             | N/A                                                            |
| `created`                                                      | *number*                                                       | :heavy_minus_sign:                                             | N/A                                                            |
| `joinedFrom`                                                   | [components.JoinedFrom](../../models/components/joinedfrom.md) | :heavy_minus_sign:                                             | N/A                                                            |
| `uid`                                                          | *string*                                                       | :heavy_minus_sign:                                             | N/A                                                            |