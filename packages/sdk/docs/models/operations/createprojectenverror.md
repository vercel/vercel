# CreateProjectEnvError

## Example Usage

```typescript
import { CreateProjectEnvError } from "@vercel/sdk/models/operations";

let value: CreateProjectEnvError = {
  code: "<value>",
  message: "<value>",
};
```

## Fields

| Field                               | Type                                | Required                            | Description                         |
| ----------------------------------- | ----------------------------------- | ----------------------------------- | ----------------------------------- |
| `code`                              | *string*                            | :heavy_check_mark:                  | N/A                                 |
| `message`                           | *string*                            | :heavy_check_mark:                  | N/A                                 |
| `key`                               | *string*                            | :heavy_minus_sign:                  | N/A                                 |
| `envVarId`                          | *string*                            | :heavy_minus_sign:                  | N/A                                 |
| `envVarKey`                         | *string*                            | :heavy_minus_sign:                  | N/A                                 |
| `action`                            | *string*                            | :heavy_minus_sign:                  | N/A                                 |
| `link`                              | *string*                            | :heavy_minus_sign:                  | N/A                                 |
| `value`                             | *operations.CreateProjectEnvValue*  | :heavy_minus_sign:                  | N/A                                 |
| `gitBranch`                         | *string*                            | :heavy_minus_sign:                  | N/A                                 |
| `target`                            | *operations.CreateProjectEnvTarget* | :heavy_minus_sign:                  | N/A                                 |
| `project`                           | *string*                            | :heavy_minus_sign:                  | N/A                                 |