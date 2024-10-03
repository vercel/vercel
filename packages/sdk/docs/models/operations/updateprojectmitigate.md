# UpdateProjectMitigate

## Example Usage

```typescript
import { UpdateProjectMitigate } from "@vercel/sdk/models/operations/updateproject.js";

let value: UpdateProjectMitigate = {
  action: "deny",
  ruleId: "<id>",
};
```

## Fields

| Field                                                                            | Type                                                                             | Required                                                                         | Description                                                                      |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `action`                                                                         | [operations.UpdateProjectAction](../../models/operations/updateprojectaction.md) | :heavy_check_mark:                                                               | N/A                                                                              |
| `ruleId`                                                                         | *string*                                                                         | :heavy_check_mark:                                                               | N/A                                                                              |
| `ttl`                                                                            | *number*                                                                         | :heavy_minus_sign:                                                               | N/A                                                                              |
| `erl`                                                                            | [operations.UpdateProjectErl](../../models/operations/updateprojecterl.md)       | :heavy_minus_sign:                                                               | N/A                                                                              |