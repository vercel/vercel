# DeleteTeamResponseBody

The Team was successfully deleted

## Example Usage

```typescript
import { DeleteTeamResponseBody } from '@vercel/client/models/operations';

let value: DeleteTeamResponseBody = {
  id: 'team_LLHUOMOoDlqOp8wPE4kFo9pE',
  newDefaultTeamIdError: true,
};
```

## Fields

| Field                   | Type      | Required           | Description                                                                                               | Example                       |
| ----------------------- | --------- | ------------------ | --------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `id`                    | _string_  | :heavy_check_mark: | The ID of the deleted Team                                                                                | team_LLHUOMOoDlqOp8wPE4kFo9pE |
| `newDefaultTeamIdError` | _boolean_ | :heavy_minus_sign: | Signifies whether the default team update has failed, when newDefaultTeamId is provided in request query. | true                          |
