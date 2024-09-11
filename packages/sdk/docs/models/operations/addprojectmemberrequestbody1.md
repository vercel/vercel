# AddProjectMemberRequestBody1

## Example Usage

```typescript
import { AddProjectMemberRequestBody1 } from "@vercel/sdk/models/operations";

let value: AddProjectMemberRequestBody1 = {
  uid: "ndlgr43fadlPyCtREAqxxdyFK",
  username: "example",
  email: "entity@example.com",
  role: "ADMIN",
};
```

## Fields

| Field                                                                    | Type                                                                     | Required                                                                 | Description                                                              | Example                                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `uid`                                                                    | *string*                                                                 | :heavy_check_mark:                                                       | The ID of the team member that should be added to this project.          | ndlgr43fadlPyCtREAqxxdyFK                                                |
| `username`                                                               | *string*                                                                 | :heavy_minus_sign:                                                       | The username of the team member that should be added to this project.    | example                                                                  |
| `email`                                                                  | *string*                                                                 | :heavy_minus_sign:                                                       | The email of the team member that should be added to this project.       | entity@example.com                                                       |
| `role`                                                                   | [operations.RequestBodyRole](../../models/operations/requestbodyrole.md) | :heavy_check_mark:                                                       | The project role of the member that will be added.                       | ADMIN                                                                    |