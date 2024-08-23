# ResponseBodyMembers

## Example Usage

```typescript
import { ResponseBodyMembers } from '@vercel/client/models/operations';

let value: ResponseBodyMembers = {
  avatar: '123a6c5209bc3778245d011443644c8d27dc2c50',
  email: 'jane.doe@example.com',
  role: 'ADMIN',
  computedProjectRole: 'ADMIN',
  uid: 'zTuNVUXEAvvnNN3IaqinkyMw',
  username: 'jane-doe',
  name: 'Jane Doe',
  createdAt: 1588720733602,
  teamRole: 'CONTRIBUTOR',
};
```

## Fields

| Field                 | Type                                                                                                         | Required           | Description                                           | Example                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------ | ----------------------------------------------------- | ---------------------------------------- |
| `avatar`              | _string_                                                                                                     | :heavy_minus_sign: | ID of the file for the Avatar of this member.         | 123a6c5209bc3778245d011443644c8d27dc2c50 |
| `email`               | _string_                                                                                                     | :heavy_check_mark: | The email of this member.                             | jane.doe@example.com                     |
| `role`                | [operations.GetProjectMembersResponseBodyRole](../../models/operations/getprojectmembersresponsebodyrole.md) | :heavy_check_mark: | Role of this user in the project.                     | ADMIN                                    |
| `computedProjectRole` | [operations.ComputedProjectRole](../../models/operations/computedprojectrole.md)                             | :heavy_check_mark: | Role of this user in the project.                     | ADMIN                                    |
| `uid`                 | _string_                                                                                                     | :heavy_check_mark: | The ID of this user.                                  | zTuNVUXEAvvnNN3IaqinkyMw                 |
| `username`            | _string_                                                                                                     | :heavy_check_mark: | The unique username of this user.                     | jane-doe                                 |
| `name`                | _string_                                                                                                     | :heavy_minus_sign: | The name of this user.                                | Jane Doe                                 |
| `createdAt`           | _number_                                                                                                     | :heavy_check_mark: | Timestamp in milliseconds when this member was added. | 1588720733602                            |
| `teamRole`            | [operations.ResponseBodyTeamRole](../../models/operations/responsebodyteamrole.md)                           | :heavy_check_mark: | The role of this user in the team.                    | CONTRIBUTOR                              |
