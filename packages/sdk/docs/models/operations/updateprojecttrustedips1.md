# UpdateProjectTrustedIps1

## Example Usage

```typescript
import { UpdateProjectTrustedIps1 } from "@vercel/sdk/models/operations/updateproject.js";

let value: UpdateProjectTrustedIps1 = {
  deploymentType: "all",
  addresses: [
    {
      value: "<value>",
    },
  ],
  protectionMode: "exclusive",
};
```

## Fields

| Field                                                                                                                | Type                                                                                                                 | Required                                                                                                             | Description                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `deploymentType`                                                                                                     | [operations.UpdateProjectTrustedIpsDeploymentType](../../models/operations/updateprojecttrustedipsdeploymenttype.md) | :heavy_check_mark:                                                                                                   | N/A                                                                                                                  |
| `addresses`                                                                                                          | [operations.UpdateProjectTrustedIpsAddresses](../../models/operations/updateprojecttrustedipsaddresses.md)[]         | :heavy_check_mark:                                                                                                   | N/A                                                                                                                  |
| `protectionMode`                                                                                                     | [operations.UpdateProjectTrustedIpsProtectionMode](../../models/operations/updateprojecttrustedipsprotectionmode.md) | :heavy_check_mark:                                                                                                   | N/A                                                                                                                  |