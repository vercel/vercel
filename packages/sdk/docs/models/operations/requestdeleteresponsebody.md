# RequestDeleteResponseBody

Response indicating that the User deletion process has been initiated, and a confirmation email has been sent.

## Example Usage

```typescript
import { RequestDeleteResponseBody } from "@vercel/sdk/models/operations/requestdelete.js";

let value: RequestDeleteResponseBody = {
  id: "<id>",
  email: "Rosalee54@gmail.com",
  message: "Verification email sent",
};
```

## Fields

| Field                                                     | Type                                                      | Required                                                  | Description                                               | Example                                                   |
| --------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| `id`                                                      | *string*                                                  | :heavy_check_mark:                                        | Unique identifier of the User who has initiated deletion. |                                                           |
| `email`                                                   | *string*                                                  | :heavy_check_mark:                                        | Email address of the User who has initiated deletion.     |                                                           |
| `message`                                                 | *string*                                                  | :heavy_check_mark:                                        | User deletion progress status.                            | Verification email sent                                   |