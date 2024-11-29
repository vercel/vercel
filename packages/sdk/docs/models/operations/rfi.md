# Rfi

## Example Usage

```typescript
import { Rfi } from "@vercel/sdk/models/operations/putfirewallconfig.js";

let value: Rfi = {
  active: false,
  action: "deny",
};
```

## Fields

| Field                                                                                                                  | Type                                                                                                                   | Required                                                                                                               | Description                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `active`                                                                                                               | *boolean*                                                                                                              | :heavy_check_mark:                                                                                                     | N/A                                                                                                                    |
| `action`                                                                                                               | [operations.PutFirewallConfigSecurityRequestAction](../../models/operations/putfirewallconfigsecurityrequestaction.md) | :heavy_check_mark:                                                                                                     | N/A                                                                                                                    |