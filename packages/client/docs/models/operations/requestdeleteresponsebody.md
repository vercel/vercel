# RequestDeleteResponseBody

Response indicating that the User deletion process has been initiated, and a confirmation email has been sent.

## Example Usage

```typescript
import { RequestDeleteResponseBody } from '@vercel/client/models/operations';

let value: RequestDeleteResponseBody = {
  id: '<id>',
  email: 'Weldon.Crooks70@hotmail.com',
  message: 'Verification email sent',
};
```

## Fields

| Field     | Type     | Required           | Description                                               | Example                 |
| --------- | -------- | ------------------ | --------------------------------------------------------- | ----------------------- |
| `id`      | _string_ | :heavy_check_mark: | Unique identifier of the User who has initiated deletion. |                         |
| `email`   | _string_ | :heavy_check_mark: | Email address of the User who has initiated deletion.     |                         |
| `message` | _string_ | :heavy_check_mark: | User deletion progress status.                            | Verification email sent |
