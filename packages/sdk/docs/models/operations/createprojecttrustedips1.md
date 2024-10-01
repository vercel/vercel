# CreateProjectTrustedIps1

## Example Usage

```typescript
import { CreateProjectTrustedIps1 } from "@vercel/sdk/models/operations/createproject.js";

let value: CreateProjectTrustedIps1 = {
  deploymentType: "production",
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
| `deploymentType`                                                                                                     | [operations.CreateProjectTrustedIpsDeploymentType](../../models/operations/createprojecttrustedipsdeploymenttype.md) | :heavy_check_mark:                                                                                                   | N/A                                                                                                                  |
| `addresses`                                                                                                          | [operations.TrustedIpsAddresses](../../models/operations/trustedipsaddresses.md)[]                                   | :heavy_check_mark:                                                                                                   | N/A                                                                                                                  |
| `protectionMode`                                                                                                     | [operations.TrustedIpsProtectionMode](../../models/operations/trustedipsprotectionmode.md)                           | :heavy_check_mark:                                                                                                   | N/A                                                                                                                  |