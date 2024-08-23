# ReadAccessGroupResponseBody

## Example Usage

```typescript
import { ReadAccessGroupResponseBody } from '@vercel/client/models/operations';

let value: ReadAccessGroupResponseBody = {
  isDsyncManaged: false,
  name: 'my-access-group',
  createdAt: '1588720733602',
  teamId: 'team_123a6c5209bc3778245d011443644c8d27dc2c50',
  updatedAt: '1588720733602',
  accessGroupId: 'ag_123a6c5209bc3778245d011443644c8d27dc2c50',
  membersCount: 5,
  projectsCount: 2,
};
```

## Fields

| Field            | Type      | Required           | Description                                                       | Example                                       |
| ---------------- | --------- | ------------------ | ----------------------------------------------------------------- | --------------------------------------------- |
| `isDsyncManaged` | _boolean_ | :heavy_check_mark: | N/A                                                               |                                               |
| `name`           | _string_  | :heavy_check_mark: | The name of this access group.                                    | my-access-group                               |
| `createdAt`      | _string_  | :heavy_check_mark: | Timestamp in milliseconds when the access group was created.      | 1588720733602                                 |
| `teamId`         | _string_  | :heavy_check_mark: | ID of the team that this access group belongs to.                 | team_123a6c5209bc3778245d011443644c8d27dc2c50 |
| `updatedAt`      | _string_  | :heavy_check_mark: | Timestamp in milliseconds when the access group was last updated. | 1588720733602                                 |
| `accessGroupId`  | _string_  | :heavy_check_mark: | ID of the access group.                                           | ag_123a6c5209bc3778245d011443644c8d27dc2c50   |
| `membersCount`   | _number_  | :heavy_check_mark: | Number of members in the access group.                            | 5                                             |
| `projectsCount`  | _number_  | :heavy_check_mark: | Number of projects in the access group.                           | 2                                             |
