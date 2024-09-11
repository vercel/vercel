# CreateProjectMitigate

## Example Usage

```typescript
import { CreateProjectMitigate } from "@vercel/sdk/models/operations";

let value: CreateProjectMitigate = {
  action: "deny",
  ruleId: "<value>",
};
```

## Fields

| Field                                                                            | Type                                                                             | Required                                                                         | Description                                                                      |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `action`                                                                         | [operations.CreateProjectAction](../../models/operations/createprojectaction.md) | :heavy_check_mark:                                                               | N/A                                                                              |
| `ruleId`                                                                         | *string*                                                                         | :heavy_check_mark:                                                               | N/A                                                                              |
| `ttl`                                                                            | *number*                                                                         | :heavy_minus_sign:                                                               | N/A                                                                              |
| `erl`                                                                            | [operations.CreateProjectErl](../../models/operations/createprojecterl.md)       | :heavy_minus_sign:                                                               | N/A                                                                              |