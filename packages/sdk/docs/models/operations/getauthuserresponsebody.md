# GetAuthUserResponseBody

Successful response.

## Example Usage

```typescript
import { GetAuthUserResponseBody } from "@vercel/sdk/models/operations";

let value: GetAuthUserResponseBody = {
  user: {
    createdAt: 1630748523395,
    softBlock: {
      blockedAt: 3189.17,
      reason: "BLOCKED_FOR_PLATFORM_ABUSE",
    },
    billing: {
      period: {
        start: 9745.89,
        end: 1623.58,
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