# InviteUserToTeamRequestBody

## Example Usage

```typescript
import { InviteUserToTeamRequestBody } from '@vercel/client/models/operations';

let value: InviteUserToTeamRequestBody = {
  uid: 'kr1PsOIzqEL5Xg6M4VZcZosf',
  email: 'john@example.com',
  role: 'OWNER',
  projects: [
    {
      projectId: 'prj_ndlgr43fadlPyCtREAqxxdyFK',
      role: 'ADMIN',
    },
  ],
};
```

## Fields

| Field      | Type                                                                                         | Required           | Description                             | Example                            |
| ---------- | -------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------- | ---------------------------------- |
| `uid`      | _string_                                                                                     | :heavy_minus_sign: | The id of the user to invite            | kr1PsOIzqEL5Xg6M4VZcZosf           |
| `email`    | _string_                                                                                     | :heavy_minus_sign: | The email address of the user to invite | john@example.com                   |
| `role`     | [operations.InviteUserToTeamRole](../../models/operations/inviteusertoteamrole.md)           | :heavy_minus_sign: | The role of the user to invite          | [<br/>"MEMBER",<br/>"VIEWER"<br/>] |
| `projects` | [operations.InviteUserToTeamProjects](../../models/operations/inviteusertoteamprojects.md)[] | :heavy_minus_sign: | N/A                                     |                                    |
