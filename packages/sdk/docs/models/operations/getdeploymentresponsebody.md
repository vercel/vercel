# GetDeploymentResponseBody

The deployment including only public information
The deployment including both public and private information

## Example Usage

```typescript
import { GetDeploymentResponseBody } from "@vercel/sdk/models/operations";

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
  bootedAt: 8563.03,
  buildingAt: 302.35,
  buildSkipped: false,
  creator: {
    uid: "<value>",
  },
  public: false,
  status: "INITIALIZING",
  id: "<id>",
  type: "LAMBDAS",
  createdAt: 7103.37,
  name: "<value>",
  readyState: "BUILDING",
  meta: {
    "key": "<value>",
  },
  regions: [
    "<value>",
  ],
  url: "http://juicy-furniture.com",
  version: 5305.37,
  projectId: "<value>",
  plan: "enterprise",
  createdIn: "<value>",
  ownerId: "<value>",
  routes: [
    {
      src: "<value>",
      continue: false,
      middleware: 3611.51,
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

