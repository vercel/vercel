# Teams

## Example Usage

```typescript
import { Teams } from "@vercel/sdk/models/operations";

let value: Teams = {
  limited: false,
  saml: {
    connection: {
      type: "OktaSAML",
      status: "linked",
      state: "active",
      connectedAt: 1611796915677,
      lastReceivedWebhookEvent: 1611796915677,
    },
    directory: {
      type: "OktaSAML",
      state: "active",
      connectedAt: 1611796915677,
      lastReceivedWebhookEvent: 1611796915677,
    },
    enforced: false,
  },
  id: "team_nllPyCtREAqxxdyFKbbMDlxd",
  slug: "my-team",
  name: "My Team",
  avatar: "6eb07268bcfadd309905ffb1579354084c24655c",
  membership: {},
  created: "<value>",
  createdAt: 1630748523395,
};
```

## Supported Types

### `components.Team`

```typescript
const value: components.Team = /* values here */
```

### `components.TeamLimited`

```typescript
const value: components.TeamLimited = /* values here */
```

