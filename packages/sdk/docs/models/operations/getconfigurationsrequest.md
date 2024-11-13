# GetConfigurationsRequest

## Example Usage

```typescript
import { GetConfigurationsRequest } from "@vercel/sdk/models/operations/getconfigurations.js";

let value: GetConfigurationsRequest = {
  view: "project",
};
```

## Fields

| Field                                                                      | Type                                                                       | Required                                                                   | Description                                                                |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `view`                                                                     | [operations.View](../../models/operations/view.md)                         | :heavy_check_mark:                                                         | N/A                                                                        |
| `installationType`                                                         | [operations.InstallationType](../../models/operations/installationtype.md) | :heavy_minus_sign:                                                         | N/A                                                                        |
| `integrationIdOrSlug`                                                      | *string*                                                                   | :heavy_minus_sign:                                                         | ID of the integration                                                      |
| `teamId`                                                                   | *string*                                                                   | :heavy_minus_sign:                                                         | The Team identifier to perform the request on behalf of.                   |
| `slug`                                                                     | *string*                                                                   | :heavy_minus_sign:                                                         | The Team slug to perform the request on behalf of.                         |