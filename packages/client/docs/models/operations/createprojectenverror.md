# CreateProjectEnvError

## Example Usage

```typescript
import { CreateProjectEnvError } from '@vercel/client/models/operations';

let value: CreateProjectEnvError = {
  code: '<value>',
  message: '<value>',
};
```

## Fields

| Field       | Type                                | Required           | Description |
| ----------- | ----------------------------------- | ------------------ | ----------- |
| `code`      | _string_                            | :heavy_check_mark: | N/A         |
| `message`   | _string_                            | :heavy_check_mark: | N/A         |
| `key`       | _string_                            | :heavy_minus_sign: | N/A         |
| `envVarId`  | _string_                            | :heavy_minus_sign: | N/A         |
| `envVarKey` | _string_                            | :heavy_minus_sign: | N/A         |
| `action`    | _string_                            | :heavy_minus_sign: | N/A         |
| `link`      | _string_                            | :heavy_minus_sign: | N/A         |
| `value`     | _operations.CreateProjectEnvValue_  | :heavy_minus_sign: | N/A         |
| `gitBranch` | _string_                            | :heavy_minus_sign: | N/A         |
| `target`    | _operations.CreateProjectEnvTarget_ | :heavy_minus_sign: | N/A         |
| `project`   | _string_                            | :heavy_minus_sign: | N/A         |
