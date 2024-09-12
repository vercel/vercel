# ActiveDashboardViews

set of dashboard view preferences (cards or list) per scopeId

## Example Usage

```typescript
import { ActiveDashboardViews } from "@vercel/sdk/models/components";

let value: ActiveDashboardViews = {
  scopeId: "<value>",
};
```

## Fields

| Field                                                                                    | Type                                                                                     | Required                                                                                 | Description                                                                              |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `scopeId`                                                                                | *string*                                                                                 | :heavy_check_mark:                                                                       | N/A                                                                                      |
| `viewPreference`                                                                         | [components.ViewPreference](../../models/components/viewpreference.md)                   | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `favoritesViewPreference`                                                                | [components.FavoritesViewPreference](../../models/components/favoritesviewpreference.md) | :heavy_minus_sign:                                                                       | N/A                                                                                      |
| `recentsViewPreference`                                                                  | [components.RecentsViewPreference](../../models/components/recentsviewpreference.md)     | :heavy_minus_sign:                                                                       | N/A                                                                                      |