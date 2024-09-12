# Security

## Example Usage

```typescript
import { Security } from "@vercel/sdk/models/operations";

let value: Security = {};
```

## Fields

| Field                                                                    | Type                                                                     | Required                                                                 | Description                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `attackModeEnabled`                                                      | *boolean*                                                                | :heavy_minus_sign:                                                       | N/A                                                                      |
| `attackModeUpdatedAt`                                                    | *number*                                                                 | :heavy_minus_sign:                                                       | N/A                                                                      |
| `firewallEnabled`                                                        | *boolean*                                                                | :heavy_minus_sign:                                                       | N/A                                                                      |
| `firewallUpdatedAt`                                                      | *number*                                                                 | :heavy_minus_sign:                                                       | N/A                                                                      |
| `attackModeActiveUntil`                                                  | *number*                                                                 | :heavy_minus_sign:                                                       | N/A                                                                      |
| `firewallConfigVersion`                                                  | *number*                                                                 | :heavy_minus_sign:                                                       | N/A                                                                      |
| `firewallRoutes`                                                         | [operations.FirewallRoutes](../../models/operations/firewallroutes.md)[] | :heavy_minus_sign:                                                       | N/A                                                                      |
| `firewallSeawallEnabled`                                                 | *boolean*                                                                | :heavy_minus_sign:                                                       | N/A                                                                      |
| `ja3Enabled`                                                             | *boolean*                                                                | :heavy_minus_sign:                                                       | N/A                                                                      |
| `ja4Enabled`                                                             | *boolean*                                                                | :heavy_minus_sign:                                                       | N/A                                                                      |