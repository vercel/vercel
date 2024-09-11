# GetProjectsMitigate

## Example Usage

```typescript
import { GetProjectsMitigate } from "@vercel/sdk/models/operations";

let value: GetProjectsMitigate = {
  action: "bypass",
  ruleId: "<value>",
};
```

## Fields

| Field                                                                        | Type                                                                         | Required                                                                     | Description                                                                  |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `action`                                                                     | [operations.GetProjectsAction](../../models/operations/getprojectsaction.md) | :heavy_check_mark:                                                           | N/A                                                                          |
| `ruleId`                                                                     | *string*                                                                     | :heavy_check_mark:                                                           | N/A                                                                          |
| `ttl`                                                                        | *number*                                                                     | :heavy_minus_sign:                                                           | N/A                                                                          |
| `erl`                                                                        | [operations.GetProjectsErl](../../models/operations/getprojectserl.md)       | :heavy_minus_sign:                                                           | N/A                                                                          |