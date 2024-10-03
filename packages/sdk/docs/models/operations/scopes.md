# Scopes

## Example Usage

```typescript
import { Scopes } from "@vercel/sdk/models/operations/getconfigurations.js";

let value: Scopes = {
  added: [
    "read-write:integration-resource",
  ],
  upgraded: [
    "read:deployment",
  ],
};
```

## Fields

| Field                                                        | Type                                                         | Required                                                     | Description                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| `added`                                                      | [operations.Added](../../models/operations/added.md)[]       | :heavy_check_mark:                                           | N/A                                                          |
| `upgraded`                                                   | [operations.Upgraded](../../models/operations/upgraded.md)[] | :heavy_check_mark:                                           | N/A                                                          |