# RemoveTeamMemberRequest

## Example Usage

```typescript
import { RemoveTeamMemberRequest } from "@vercel/sdk/models/operations/removeteammember.js";

let value: RemoveTeamMemberRequest = {
  uid: "ndlgr43fadlPyCtREAqxxdyFK",
  newDefaultTeamId: "team_nllPyCtREAqxxdyFKbbMDlxd",
  teamId: "<id>",
};
```

## Fields

| Field                                                                     | Type                                                                      | Required                                                                  | Description                                                               | Example                                                                   |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `uid`                                                                     | *string*                                                                  | :heavy_check_mark:                                                        | The user ID of the member.                                                | ndlgr43fadlPyCtREAqxxdyFK                                                 |
| `newDefaultTeamId`                                                        | *string*                                                                  | :heavy_minus_sign:                                                        | The ID of the team to set as the new default team for the Northstar user. | team_nllPyCtREAqxxdyFKbbMDlxd                                             |
| `teamId`                                                                  | *string*                                                                  | :heavy_check_mark:                                                        | N/A                                                                       |                                                                           |