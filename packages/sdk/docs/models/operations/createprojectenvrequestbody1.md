# CreateProjectEnvRequestBody1

## Example Usage

```typescript
import { CreateProjectEnvRequestBody1 } from "@vercel/sdk/models/operations";

let value: CreateProjectEnvRequestBody1 = {
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

### `operations.CreateProjectEnv11`

```typescript
const value: operations.CreateProjectEnv11 = /* values here */
```

### `operations.CreateProjectEnv12`

```typescript
const value: operations.CreateProjectEnv12 = /* values here */
```

