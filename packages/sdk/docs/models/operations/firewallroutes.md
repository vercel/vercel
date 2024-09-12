# FirewallRoutes

## Example Usage

```typescript
import { FirewallRoutes } from "@vercel/sdk/models/operations";

let value: FirewallRoutes = {};
```

## Fields

| Field                                                      | Type                                                       | Required                                                   | Description                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `src`                                                      | *operations.Src*                                           | :heavy_minus_sign:                                         | N/A                                                        |
| `has`                                                      | [operations.Has](../../models/operations/has.md)[]         | :heavy_minus_sign:                                         | N/A                                                        |
| `missing`                                                  | [operations.Missing](../../models/operations/missing.md)[] | :heavy_minus_sign:                                         | N/A                                                        |
| `dest`                                                     | *string*                                                   | :heavy_minus_sign:                                         | N/A                                                        |
| `status`                                                   | *number*                                                   | :heavy_minus_sign:                                         | N/A                                                        |
| `handle`                                                   | [operations.Handle](../../models/operations/handle.md)     | :heavy_minus_sign:                                         | N/A                                                        |
| `mitigate`                                                 | [operations.Mitigate](../../models/operations/mitigate.md) | :heavy_minus_sign:                                         | N/A                                                        |