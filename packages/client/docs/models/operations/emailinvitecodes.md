# EmailInviteCodes

## Example Usage

```typescript
import { EmailInviteCodes } from '@vercel/client/models/operations';

let value: EmailInviteCodes = {
  id: '<id>',
  isDSyncUser: false,
};
```

## Fields

| Field          | Type                                                                                                             | Required           | Description |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `accessGroups` | _string_[]                                                                                                       | :heavy_minus_sign: | N/A         |
| `id`           | _string_                                                                                                         | :heavy_check_mark: | N/A         |
| `email`        | _string_                                                                                                         | :heavy_minus_sign: | N/A         |
| `role`         | [operations.GetTeamMembersTeamsRole](../../models/operations/getteammembersteamsrole.md)                         | :heavy_minus_sign: | N/A         |
| `isDSyncUser`  | _boolean_                                                                                                        | :heavy_check_mark: | N/A         |
| `createdAt`    | _number_                                                                                                         | :heavy_minus_sign: | N/A         |
| `expired`      | _boolean_                                                                                                        | :heavy_minus_sign: | N/A         |
| `projects`     | Record<string, [operations.GetTeamMembersTeamsProjects](../../models/operations/getteammembersteamsprojects.md)> | :heavy_minus_sign: | N/A         |
