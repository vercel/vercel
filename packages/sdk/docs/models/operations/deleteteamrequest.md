# DeleteTeamRequest

## Example Usage

```typescript
import { DeleteTeamRequest } from "@vercel/sdk/models/operations";

let value: DeleteTeamRequest = {
  newDefaultTeamId: "team_LLHUOMOoDlqOp8wPE4kFo9pE",
  teamId: "<value>",
};
```

## Fields

| Field                                                                                | Type                                                                                 | Required                                                                             | Description                                                                          | Example                                                                              |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `newDefaultTeamId`                                                                   | *string*                                                                             | :heavy_minus_sign:                                                                   | Id of the team to be set as the new default team                                     | team_LLHUOMOoDlqOp8wPE4kFo9pE                                                        |
| `teamId`                                                                             | *string*                                                                             | :heavy_check_mark:                                                                   | The Team identifier to perform the request on behalf of.                             |                                                                                      |
| `slug`                                                                               | *string*                                                                             | :heavy_minus_sign:                                                                   | The Team slug to perform the request on behalf of.                                   |                                                                                      |
| `requestBody`                                                                        | [operations.DeleteTeamRequestBody](../../models/operations/deleteteamrequestbody.md) | :heavy_minus_sign:                                                                   | N/A                                                                                  |                                                                                      |