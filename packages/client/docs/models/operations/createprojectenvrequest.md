# CreateProjectEnvRequest

## Example Usage

```typescript
import { CreateProjectEnvRequest } from '@vercel/client/models/operations';

let value: CreateProjectEnvRequest = {
  idOrName: 'prj_XLKmu1DyR1eY7zq8UgeRKbA7yVLA',
  upsert: 'true',
  requestBody: {
    key: 'API_URL',
    value: 'https://api.vercel.com',
    type: 'plain',
    target: ['preview'],
    gitBranch: 'feature-1',
    comment: 'database connection string for production',
  },
};
```

## Fields

| Field         | Type                                     | Required           | Description                                                 | Example                          |
| ------------- | ---------------------------------------- | ------------------ | ----------------------------------------------------------- | -------------------------------- |
| `idOrName`    | _string_                                 | :heavy_check_mark: | The unique project identifier or the project name           | prj_XLKmu1DyR1eY7zq8UgeRKbA7yVLA |
| `upsert`      | _string_                                 | :heavy_minus_sign: | Allow override of environment variable if it already exists | true                             |
| `teamId`      | _string_                                 | :heavy_minus_sign: | The Team identifier to perform the request on behalf of.    |                                  |
| `slug`        | _string_                                 | :heavy_minus_sign: | The Team slug to perform the request on behalf of.          |                                  |
| `requestBody` | _operations.CreateProjectEnvRequestBody_ | :heavy_minus_sign: | N/A                                                         |                                  |
