# GetDeploymentEventsResponseBody

A stream of jsonlines where each line is a deployment log item.
Array of deployment logs for the provided query.


## Supported Types

### `operations.GetDeploymentEventsResponseBodyDeployments1`

```typescript
const value: operations.GetDeploymentEventsResponseBodyDeployments1 = {
  created: 832.91,
  date: 510.75,
  deploymentId: "<id>",
  id: "<id>",
  info: {
    type: "<value>",
    name: "<value>",
  },
  serial: "<value>",
  type: "fatal",
};
```

### `operations.GetDeploymentEventsResponseBodyDeployments2`

```typescript
const value: operations.GetDeploymentEventsResponseBodyDeployments2 = {
  type: "edge-function-invocation",
  created: 1520.27,
  payload: {
    deploymentId: "<id>",
    id: "<id>",
    date: 6.64,
    serial: "<value>",
  },
};
```

