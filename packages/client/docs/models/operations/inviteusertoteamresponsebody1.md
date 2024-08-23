# InviteUserToTeamResponseBody1

The member was successfully added to the team

## Example Usage

```typescript
import { InviteUserToTeamResponseBody1 } from '@vercel/client/models/operations';

let value: InviteUserToTeamResponseBody1 = {
  uid: 'kr1PsOIzqEL5Xg6M4VZcZosf',
  username: 'john-doe',
  email: 'john@user.co',
  role: 'MEMBER',
};
```

## Fields

| Field      | Type                                                                       | Required           | Description                                                                        | Example                  |
| ---------- | -------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------- | ------------------------ |
| `uid`      | _string_                                                                   | :heavy_check_mark: | The ID of the invited user                                                         | kr1PsOIzqEL5Xg6M4VZcZosf |
| `username` | _string_                                                                   | :heavy_check_mark: | The username of the invited user                                                   | john-doe                 |
| `email`    | _string_                                                                   | :heavy_minus_sign: | The email of the invited user. Not included if the user was invited via their UID. | john@user.co             |
| `role`     | [operations.ResponseBodyRole](../../models/operations/responsebodyrole.md) | :heavy_check_mark: | The role used for the invitation                                                   | MEMBER                   |
