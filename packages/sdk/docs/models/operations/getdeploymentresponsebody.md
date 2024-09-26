# GetDeploymentResponseBody

The deployment including only public information
The deployment including both public and private information

## Example Usage

```typescript
import { GetDeploymentResponseBody } from "@vercel/sdk/models/operations/getdeployment.js";

let value: GetDeploymentResponseBody = {
  build: {
    env: [
      "<value>",
    ],
  },
  env: [
    "<value>",
  ],
  inspectorUrl: "<value>",
  isInConcurrentBuildsQueue: false,
  projectSettings: {},
  aliasAssigned: false,
  bootedAt: 9382.56,
  buildingAt: 2445.70,
  buildSkipped: false,
  creator: {
    uid: "<value>",
  },
  public: false,
  status: "ERROR",
  id: "<id>",
  type: "LAMBDAS",
  createdAt: 7574.07,
  name: "<value>",
  readyState: "BUILDING",
  meta: {
    "key": "<value>",
  },
  regions: [
    "<value>",
  ],
  url: "https://dependent-brush.com",
  version: 3576.39,
  projectId: "<value>",
  plan: "pro",
  createdIn: "<value>",
  ownerId: "<value>",
  routes: [
    {
      handle: "miss",
    },
  ],
};
```

## Supported Types

### `operations.GetDeploymentResponseBody1`

```typescript
const value: operations.GetDeploymentResponseBody1 = /* values here */
```

### `operations.GetDeploymentResponseBody2`

```typescript
const value: operations.GetDeploymentResponseBody2 = /* values here */
```

