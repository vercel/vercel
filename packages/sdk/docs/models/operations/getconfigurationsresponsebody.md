# GetConfigurationsResponseBody

The list of configurations for the authenticated user

## Example Usage

```typescript
import { GetConfigurationsResponseBody } from "@vercel/sdk/models/operations";

let value: GetConfigurationsResponseBody = [
  {
    completedAt: 1558531915505,
    createdAt: 1558531915505,
    id: "icfg_3bwCLgxL8qt5kjRLcv2Dit7F",
    integrationId: "oac_xzpVzcUOgcB1nrVlirtKhbWV",
    ownerId: "kr1PsOIzqEL5Xg6M4VZcZosf",
    projects: [
      "prj_xQxbutw1HpL6HLYPAzt5h75m8NjO",
    ],
    source: "marketplace",
    slug: "slack",
    teamId: "team_nLlpyC6RE1qxydlFKbrxDlud",
    updatedAt: 1558531915505,
    userId: "kr1PsOIzqEL5Xg6M4VZcZosf",
    scopes: [
      "read:project",
      "read-write:log-drain",
    ],
    disabledAt: 1558531915505,
    deletedAt: 1558531915505,
  },
];
```

## Supported Types

### `operations.GetConfigurationsResponseBody1[]`

```typescript
const value: operations.GetConfigurationsResponseBody1[] = /* values here */
```

### `operations.GetConfigurationsResponseBody2[]`

```typescript
const value: operations.GetConfigurationsResponseBody2[] = /* values here */
```

