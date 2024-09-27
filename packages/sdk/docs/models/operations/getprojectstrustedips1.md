# GetProjectsTrustedIps1

## Example Usage

```typescript
import { GetProjectsTrustedIps1 } from "@vercel/sdk/models/operations/getprojects.js";

let value: GetProjectsTrustedIps1 = {
  deploymentType: "all",
  addresses: [
    {
      value: "<value>",
    },
  ],
  protectionMode: "additional",
};
```

## Fields

| Field                                                                                                            | Type                                                                                                             | Required                                                                                                         | Description                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `deploymentType`                                                                                                 | [operations.GetProjectsTrustedIpsDeploymentType](../../models/operations/getprojectstrustedipsdeploymenttype.md) | :heavy_check_mark:                                                                                               | N/A                                                                                                              |
| `addresses`                                                                                                      | [operations.GetProjectsTrustedIpsAddresses](../../models/operations/getprojectstrustedipsaddresses.md)[]         | :heavy_check_mark:                                                                                               | N/A                                                                                                              |
| `protectionMode`                                                                                                 | [operations.GetProjectsTrustedIpsProtectionMode](../../models/operations/getprojectstrustedipsprotectionmode.md) | :heavy_check_mark:                                                                                               | N/A                                                                                                              |