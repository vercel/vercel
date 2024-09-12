# GetConfigurationResponseBodyScopes

## Example Usage

```typescript
import { GetConfigurationResponseBodyScopes } from "@vercel/sdk/models/operations";

let value: GetConfigurationResponseBodyScopes = {
  added: [
    "read:project",
  ],
  upgraded: [
    "read-write:project",
  ],
};
```

## Fields

| Field                                                                                                                | Type                                                                                                                 | Required                                                                                                             | Description                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `added`                                                                                                              | [operations.GetConfigurationResponseBodyAdded](../../models/operations/getconfigurationresponsebodyadded.md)[]       | :heavy_check_mark:                                                                                                   | N/A                                                                                                                  |
| `upgraded`                                                                                                           | [operations.GetConfigurationResponseBodyUpgraded](../../models/operations/getconfigurationresponsebodyupgraded.md)[] | :heavy_check_mark:                                                                                                   | N/A                                                                                                                  |