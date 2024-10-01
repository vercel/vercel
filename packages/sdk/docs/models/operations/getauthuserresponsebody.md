# GetAuthUserResponseBody

Successful response.

## Example Usage

```typescript
import { GetAuthUserResponseBody } from "@vercel/sdk/models/operations/getauthuser.js";

let value: GetAuthUserResponseBody = {
  user: {
    createdAt: 1630748523395,
    softBlock: {
      blockedAt: 7569.35,
      reason: "UNPAID_INVOICE",
    },
    billing: {
      period: {
        start: 6379.69,
        end: 6037.83,
      },
      plan: "enterprise",
    },
    resourceConfig: {},
    stagingPrefix: "<value>",
    hasTrialAvailable: false,
    id: "AEIIDYVk59zbFF2Sxfyxxmua",
    email: "me@example.com",
    name: "John Doe",
    username: "jdoe",
    avatar: "22cb30c85ff45ac4c72de8981500006b28114aa1",
    defaultTeamId: "<id>",
    version: "northstar",
  },
};
```

## Fields

| Field              | Type               | Required           | Description        |
| ------------------ | ------------------ | ------------------ | ------------------ |
| `user`             | *operations.User*  | :heavy_check_mark: | N/A                |