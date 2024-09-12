# GetDeploymentEventsResponseBody

A stream of jsonlines where each line is a deployment log item.
Array of deployment logs for the provided query.

## Example Usage

```typescript
import { GetDeploymentEventsResponseBody } from "@vercel/sdk/models/operations";

let value: GetDeploymentEventsResponseBody = {
  type: "middleware-invocation",
  created: 4148.57,
  payload: {
    deploymentId: "<value>",
    id: "<id>",
    date: 4471.44,
    serial: "<value>",
  },
};
```

## Supported Types

### `operations.GetDeploymentEventsResponseBodyDeployments1`

```typescript
const value: operations.GetDeploymentEventsResponseBodyDeployments1 = /* values here */
```

### `operations.GetDeploymentEventsResponseBodyDeployments2`

```typescript
const value: operations.GetDeploymentEventsResponseBodyDeployments2 = /* values here */
```

