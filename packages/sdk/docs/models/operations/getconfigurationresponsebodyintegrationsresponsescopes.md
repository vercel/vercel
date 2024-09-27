# GetConfigurationResponseBodyIntegrationsResponseScopes

## Example Usage

```typescript
import { GetConfigurationResponseBodyIntegrationsResponseScopes } from "@vercel/sdk/models/operations/getconfiguration.js";

let value: GetConfigurationResponseBodyIntegrationsResponseScopes = {
  added: [
    "read-write:domain",
  ],
  upgraded: [
    "read:monitoring",
  ],
};
```

## Fields

| Field                                                                                                                                                        | Type                                                                                                                                                         | Required                                                                                                                                                     | Description                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `added`                                                                                                                                                      | [operations.GetConfigurationResponseBodyIntegrationsResponseAdded](../../models/operations/getconfigurationresponsebodyintegrationsresponseadded.md)[]       | :heavy_check_mark:                                                                                                                                           | N/A                                                                                                                                                          |
| `upgraded`                                                                                                                                                   | [operations.GetConfigurationResponseBodyIntegrationsResponseUpgraded](../../models/operations/getconfigurationresponsebodyintegrationsresponseupgraded.md)[] | :heavy_check_mark:                                                                                                                                           | N/A                                                                                                                                                          |