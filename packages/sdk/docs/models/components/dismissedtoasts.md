# DismissedToasts

A record of when, under a certain scopeId, a toast was dismissed

## Example Usage

```typescript
import { DismissedToasts } from "@vercel/sdk/models/components/authuser.js";

let value: DismissedToasts = {
  name: "<value>",
  dismissals: [
    {
      scopeId: "<value>",
      createdAt: 8156.18,
    },
  ],
};
```

## Fields

| Field                                                            | Type                                                             | Required                                                         | Description                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `name`                                                           | *string*                                                         | :heavy_check_mark:                                               | N/A                                                              |
| `dismissals`                                                     | [components.Dismissals](../../models/components/dismissals.md)[] | :heavy_check_mark:                                               | N/A                                                              |