# JoinTeamRequest

## Example Usage

```typescript
import { JoinTeamRequest } from "@vercel/sdk/models/operations/jointeam.js";

let value: JoinTeamRequest = {
  teamId: "<id>",
  requestBody: {
    inviteCode: "fisdh38aejkeivn34nslfore9vjtn4ls",
  },
};
```

## Fields

| Field                                                                            | Type                                                                             | Required                                                                         | Description                                                                      |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `teamId`                                                                         | *string*                                                                         | :heavy_check_mark:                                                               | N/A                                                                              |
| `requestBody`                                                                    | [operations.JoinTeamRequestBody](../../models/operations/jointeamrequestbody.md) | :heavy_minus_sign:                                                               | N/A                                                                              |