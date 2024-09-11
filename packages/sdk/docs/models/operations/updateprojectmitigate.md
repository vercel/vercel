# UpdateProjectMitigate

## Example Usage

```typescript
import { UpdateProjectMitigate } from "@vercel/sdk/models/operations";

let value: UpdateProjectMitigate = {
  action: "challenge",
  ruleId: "<value>",
};
```

## Fields

| Field                                                                            | Type                                                                             | Required                                                                         | Description                                                                      |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `action`                                                                         | [operations.UpdateProjectAction](../../models/operations/updateprojectaction.md) | :heavy_check_mark:                                                               | N/A                                                                              |
| `ruleId`                                                                         | *string*                                                                         | :heavy_check_mark:                                                               | N/A                                                                              |
| `ttl`                                                                            | *number*                                                                         | :heavy_minus_sign:                                                               | N/A                                                                              |
| `erl`                                                                            | [operations.UpdateProjectErl](../../models/operations/updateprojecterl.md)       | :heavy_minus_sign:                                                               | N/A                                                                              |