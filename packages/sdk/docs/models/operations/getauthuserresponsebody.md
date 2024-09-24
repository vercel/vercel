# GetAuthUserResponseBody

Successful response.

## Example Usage

```typescript
import { GetAuthUserResponseBody } from "@vercel/sdk/models/operations/getauthuser.js";

let value: GetAuthUserResponseBody = {
  user: {
    createdAt: 1630748523395,
    softBlock: {
      blockedAt: 8506.28,
      reason: "ENTERPRISE_TRIAL_ENDED",
    },
    billing: {
      period: {
        start: 7399.37,
        end: 7046.65,
      },
      plan: "hobby",
    },
    resourceConfig: {},
    stagingPrefix: "<value>",
    hasTrialAvailable: false,
    id: "AEIIDYVk59zbFF2Sxfyxxmua",
    email: "me@example.com",
    name: "John Doe",
    username: "jdoe",
    avatar: "22cb30c85ff45ac4c72de8981500006b28114aa1",
    defaultTeamId: "<value>",
    version: "northstar",
  },
};
```

## Fields

| Field              | Type               | Required           | Description        |
| ------------------ | ------------------ | ------------------ | ------------------ |
| `user`             | *operations.User*  | :heavy_check_mark: | N/A                |