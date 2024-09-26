# User

## Example Usage

```typescript
import { User } from "@vercel/sdk/models/operations/getauthuser.js";

let value: User = {
  createdAt: 1630748523395,
  softBlock: {
    blockedAt: 5955.85,
    reason: "UNPAID_INVOICE",
  },
  billing: {
    period: {
      start: 6925.55,
      end: 8196.90,
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
  defaultTeamId: "<value>",
  version: "northstar",
};
```

## Supported Types

### `components.AuthUser`

```typescript
const value: components.AuthUser = /* values here */
```

### `components.AuthUserLimited`

```typescript
const value: components.AuthUserLimited = /* values here */
```

