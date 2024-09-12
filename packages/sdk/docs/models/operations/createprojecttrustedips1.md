# CreateProjectTrustedIps1

## Example Usage

```typescript
import { CreateProjectTrustedIps1 } from "@vercel/sdk/models/operations";

let value: CreateProjectTrustedIps1 = {
  deploymentType: "preview",
  addresses: [
    {
      value: "<value>",
    },
  ],
  protectionMode: "additional",
};
```

## Fields

| Field                                                                                                                | Type                                                                                                                 | Required                                                                                                             | Description                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `deploymentType`                                                                                                     | [operations.CreateProjectTrustedIpsDeploymentType](../../models/operations/createprojecttrustedipsdeploymenttype.md) | :heavy_check_mark:                                                                                                   | N/A                                                                                                                  |
| `addresses`                                                                                                          | [operations.TrustedIpsAddresses](../../models/operations/trustedipsaddresses.md)[]                                   | :heavy_check_mark:                                                                                                   | N/A                                                                                                                  |
| `protectionMode`                                                                                                     | [operations.TrustedIpsProtectionMode](../../models/operations/trustedipsprotectionmode.md)                           | :heavy_check_mark:                                                                                                   | N/A                                                                                                                  |