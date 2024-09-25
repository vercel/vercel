# GetConfigurationResponseBodyScopes

## Example Usage

```typescript
import { GetConfigurationResponseBodyScopes } from "@vercel/sdk/models/operations/getconfiguration.js";

let value: GetConfigurationResponseBodyScopes = {
  added: [
    "read-write:log-drain",
  ],
  upgraded: [
    "read-write:integration-configuration",
  ],
};
```

## Fields

| Field                                                                                                                | Type                                                                                                                 | Required                                                                                                             | Description                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `added`                                                                                                              | [operations.GetConfigurationResponseBodyAdded](../../models/operations/getconfigurationresponsebodyadded.md)[]       | :heavy_check_mark:                                                                                                   | N/A                                                                                                                  |
| `upgraded`                                                                                                           | [operations.GetConfigurationResponseBodyUpgraded](../../models/operations/getconfigurationresponsebodyupgraded.md)[] | :heavy_check_mark:                                                                                                   | N/A                                                                                                                  |