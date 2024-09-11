# CreateProjectEnvRequestBody

## Example Usage

```typescript
import { CreateProjectEnvRequestBody } from "@vercel/sdk/models/operations";

let value: CreateProjectEnvRequestBody = {
  key: "API_URL",
  value: "https://api.vercel.com",
  type: "plain",
  target: [
    "preview",
  ],
  gitBranch: "feature-1",
  comment: "database connection string for production",
};
```

## Supported Types

### `operations.CreateProjectEnvRequestBody1`

```typescript
const value: operations.CreateProjectEnvRequestBody1 = /* values here */
```

### `operations.CreateProjectEnvRequestBody2[]`

```typescript
const value: operations.CreateProjectEnvRequestBody2[] = /* values here */
```

