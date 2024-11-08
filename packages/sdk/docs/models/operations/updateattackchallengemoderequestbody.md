# UpdateAttackChallengeModeRequestBody

## Example Usage

```typescript
import { UpdateAttackChallengeModeRequestBody } from "@vercel/sdk/models/operations/updateattackchallengemode.js";

let value: UpdateAttackChallengeModeRequestBody = {
  projectId: "<id>",
  attackModeEnabled: false,
};
```

## Fields

| Field                   | Type                    | Required                | Description             |
| ----------------------- | ----------------------- | ----------------------- | ----------------------- |
| `projectId`             | *string*                | :heavy_check_mark:      | N/A                     |
| `attackModeEnabled`     | *boolean*               | :heavy_check_mark:      | N/A                     |
| `attackModeActiveUntil` | *number*                | :heavy_minus_sign:      | N/A                     |