# CreateTeamResponseBody

The team was created successfully

## Example Usage

```typescript
import { CreateTeamResponseBody } from "@vercel/sdk/models/operations/createteam.js";

let value: CreateTeamResponseBody = {
  id: "team_nLlpyC6RE1qxqglFKbrMxlud",
  slug: "<value>",
  billing: {
    period: {
      start: 5902.80,
      end: 3114.49,
    },
    plan: "pro",
  },
};
```

## Fields

| Field                                                                                                                                                                               | Type                                                                                                                                                                                | Required                                                                                                                                                                            | Description                                                                                                                                                                         | Example                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                                                                                                                                | *string*                                                                                                                                                                            | :heavy_check_mark:                                                                                                                                                                  | Id of the created team                                                                                                                                                              | team_nLlpyC6RE1qxqglFKbrMxlud                                                                                                                                                       |
| `slug`                                                                                                                                                                              | *string*                                                                                                                                                                            | :heavy_check_mark:                                                                                                                                                                  | N/A                                                                                                                                                                                 |                                                                                                                                                                                     |
| `billing`                                                                                                                                                                           | [operations.Billing](../../models/operations/billing.md)                                                                                                                            | :heavy_check_mark:                                                                                                                                                                  | IMPORTANT: If extending Billing, particularly with optional fields, make sure you also update `sync-orb-subscription-to-owner.ts` to handle the items when the object is recreated. |                                                                                                                                                                                     |