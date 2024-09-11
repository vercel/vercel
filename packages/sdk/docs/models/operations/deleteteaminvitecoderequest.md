# DeleteTeamInviteCodeRequest

## Example Usage

```typescript
import { DeleteTeamInviteCodeRequest } from "@vercel/sdk/models/operations";

let value: DeleteTeamInviteCodeRequest = {
  inviteId: "2wn2hudbr4chb1ecywo9dvzo7g9sscs6mzcz8htdde0txyom4l",
  teamId: "team_LLHUOMOoDlqOp8wPE4kFo9pE",
};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              | Example                                                  |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `inviteId`                                               | *string*                                                 | :heavy_check_mark:                                       | The Team invite code ID.                                 | 2wn2hudbr4chb1ecywo9dvzo7g9sscs6mzcz8htdde0txyom4l       |
| `teamId`                                                 | *string*                                                 | :heavy_check_mark:                                       | The Team identifier to perform the request on behalf of. | team_LLHUOMOoDlqOp8wPE4kFo9pE                            |