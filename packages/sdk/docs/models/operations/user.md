# User


## Supported Types

### `components.AuthUser`

```typescript
const value: components.AuthUser = {
  createdAt: 1630748523395,
  softBlock: {
    blockedAt: 5059.08,
    reason: "UNPAID_INVOICE",
  },
  billing: {
    period: {
      start: 8903.79,
      end: 282.57,
    },
    plan: "pro",
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
};
```

### `components.AuthUserLimited`

```typescript
const value: components.AuthUserLimited = {
  limited: false,
  id: "AEIIDYVk59zbFF2Sxfyxxmua",
  email: "me@example.com",
  name: "John Doe",
  username: "jdoe",
  avatar: "22cb30c85ff45ac4c72de8981500006b28114aa1",
  defaultTeamId: "<id>",
  version: "northstar",
};
```

