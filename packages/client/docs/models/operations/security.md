# Security

## Example Usage

```typescript
import { Security } from '@vercel/client/models/operations';

let value: Security = {};
```

## Fields

| Field                    | Type                                                                     | Required           | Description |
| ------------------------ | ------------------------------------------------------------------------ | ------------------ | ----------- |
| `attackModeEnabled`      | _boolean_                                                                | :heavy_minus_sign: | N/A         |
| `attackModeUpdatedAt`    | _number_                                                                 | :heavy_minus_sign: | N/A         |
| `firewallEnabled`        | _boolean_                                                                | :heavy_minus_sign: | N/A         |
| `firewallUpdatedAt`      | _number_                                                                 | :heavy_minus_sign: | N/A         |
| `attackModeActiveUntil`  | _number_                                                                 | :heavy_minus_sign: | N/A         |
| `firewallConfigVersion`  | _number_                                                                 | :heavy_minus_sign: | N/A         |
| `firewallRoutes`         | [operations.FirewallRoutes](../../models/operations/firewallroutes.md)[] | :heavy_minus_sign: | N/A         |
| `firewallSeawallEnabled` | _boolean_                                                                | :heavy_minus_sign: | N/A         |
| `ja3Enabled`             | _boolean_                                                                | :heavy_minus_sign: | N/A         |
| `ja4Enabled`             | _boolean_                                                                | :heavy_minus_sign: | N/A         |
