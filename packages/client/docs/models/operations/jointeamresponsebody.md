# JoinTeamResponseBody

Successfully joined a team.

## Example Usage

```typescript
import { JoinTeamResponseBody } from '@vercel/client/models/operations';

let value: JoinTeamResponseBody = {
  teamId: 'team_LLHUOMOoDlqOp8wPE4kFo9pE',
  slug: 'my-team',
  name: 'My Team',
  from: 'email',
};
```

## Fields

| Field    | Type     | Required           | Description                           | Example                       |
| -------- | -------- | ------------------ | ------------------------------------- | ----------------------------- |
| `teamId` | _string_ | :heavy_check_mark: | The ID of the team the user joined.   | team_LLHUOMOoDlqOp8wPE4kFo9pE |
| `slug`   | _string_ | :heavy_check_mark: | The slug of the team the user joined. | my-team                       |
| `name`   | _string_ | :heavy_check_mark: | The name of the team the user joined. | My Team                       |
| `from`   | _string_ | :heavy_check_mark: | The origin of how the user joined.    | email                         |
