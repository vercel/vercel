# BranchMatcher

## Example Usage

```typescript
import { BranchMatcher } from "@vercel/sdk/models/operations";

let value: BranchMatcher = {
  type: "equals",
  pattern: "<value>",
};
```

## Fields

| Field                                                                                                                | Type                                                                                                                 | Required                                                                                                             | Description                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `type`                                                                                                               | [operations.CreateDeploymentCustomEnvironmentType](../../models/operations/createdeploymentcustomenvironmenttype.md) | :heavy_check_mark:                                                                                                   | N/A                                                                                                                  |
| `pattern`                                                                                                            | *string*                                                                                                             | :heavy_check_mark:                                                                                                   | N/A                                                                                                                  |