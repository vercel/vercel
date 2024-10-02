# GetConfigurationResponseBodyScopesQueue

## Example Usage

```typescript
import { GetConfigurationResponseBodyScopesQueue } from "@vercel/sdk/models/operations/getconfiguration.js";

let value: GetConfigurationResponseBodyScopesQueue = {
  scopes: {
    added: [
      "read-write:edge-config",
    ],
    upgraded: [
      "read-write:edge-config",
    ],
  },
  note: "<value>",
  requestedAt: 9270.21,
};
```

## Fields

| Field                                                                                                          | Type                                                                                                           | Required                                                                                                       | Description                                                                                                    |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `scopes`                                                                                                       | [operations.GetConfigurationResponseBodyScopes](../../models/operations/getconfigurationresponsebodyscopes.md) | :heavy_check_mark:                                                                                             | N/A                                                                                                            |
| `note`                                                                                                         | *string*                                                                                                       | :heavy_check_mark:                                                                                             | N/A                                                                                                            |
| `requestedAt`                                                                                                  | *number*                                                                                                       | :heavy_check_mark:                                                                                             | N/A                                                                                                            |
| `confirmedAt`                                                                                                  | *number*                                                                                                       | :heavy_minus_sign:                                                                                             | N/A                                                                                                            |