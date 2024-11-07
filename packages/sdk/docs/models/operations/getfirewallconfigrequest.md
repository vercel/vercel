# GetFirewallConfigRequest

## Example Usage

```typescript
import { GetFirewallConfigRequest } from "@vercel/sdk/models/operations/getfirewallconfig.js";

let value: GetFirewallConfigRequest = {
  projectId: "<id>",
  configVersion: "<value>",
};
```

## Fields

| Field                                                     | Type                                                      | Required                                                  | Description                                               |
| --------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| `projectId`                                               | *string*                                                  | :heavy_check_mark:                                        | N/A                                                       |
| `teamId`                                                  | *string*                                                  | :heavy_minus_sign:                                        | The Team identifier to perform the request on behalf of.  |
| `slug`                                                    | *string*                                                  | :heavy_minus_sign:                                        | The Team slug to perform the request on behalf of.        |
| `configVersion`                                           | *string*                                                  | :heavy_check_mark:                                        | The deployed configVersion for the firewall configuration |