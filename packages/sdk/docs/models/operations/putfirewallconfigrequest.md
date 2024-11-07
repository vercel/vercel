# PutFirewallConfigRequest

## Example Usage

```typescript
import { PutFirewallConfigRequest } from "@vercel/sdk/models/operations/putfirewallconfig.js";

let value: PutFirewallConfigRequest = {
  projectId: "<id>",
};
```

## Fields

| Field                                                                                              | Type                                                                                               | Required                                                                                           | Description                                                                                        |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `projectId`                                                                                        | *string*                                                                                           | :heavy_check_mark:                                                                                 | N/A                                                                                                |
| `teamId`                                                                                           | *string*                                                                                           | :heavy_minus_sign:                                                                                 | The Team identifier to perform the request on behalf of.                                           |
| `slug`                                                                                             | *string*                                                                                           | :heavy_minus_sign:                                                                                 | The Team slug to perform the request on behalf of.                                                 |
| `requestBody`                                                                                      | [operations.PutFirewallConfigRequestBody](../../models/operations/putfirewallconfigrequestbody.md) | :heavy_minus_sign:                                                                                 | N/A                                                                                                |