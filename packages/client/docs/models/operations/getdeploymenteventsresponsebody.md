# GetDeploymentEventsResponseBody

A stream of jsonlines where each line is a deployment log item.
Array of deployment logs for the provided query.

## Example Usage

```typescript
import { GetDeploymentEventsResponseBody } from '@vercel/client/models/operations';

let value: GetDeploymentEventsResponseBody = {
  type: 'middleware-invocation',
  created: 7382.27,
  payload: {
    deploymentId: '<value>',
    id: '<id>',
    date: 4148.57,
    serial: '<value>',
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
