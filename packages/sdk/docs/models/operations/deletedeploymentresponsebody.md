# DeleteDeploymentResponseBody

The deployment was successfully deleted

## Example Usage

```typescript
import { DeleteDeploymentResponseBody } from "@vercel/sdk/models/operations";

let value: DeleteDeploymentResponseBody = {
  uid: "dpl_5WJWYSyB7BpgTj3EuwF37WMRBXBtPQ2iTMJHJBJyRfd",
  state: "DELETED",
};
```

## Fields

| Field                                                | Type                                                 | Required                                             | Description                                          | Example                                              |
| ---------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `uid`                                                | *string*                                             | :heavy_check_mark:                                   | The removed deployment ID.                           | dpl_5WJWYSyB7BpgTj3EuwF37WMRBXBtPQ2iTMJHJBJyRfd      |
| `state`                                              | [operations.State](../../models/operations/state.md) | :heavy_check_mark:                                   | A constant with the final state of the deployment.   |                                                      |