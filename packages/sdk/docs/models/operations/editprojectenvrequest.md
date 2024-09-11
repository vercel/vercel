# EditProjectEnvRequest

## Example Usage

```typescript
import { EditProjectEnvRequest } from "@vercel/sdk/models/operations";

let value: EditProjectEnvRequest = {
  idOrName: "prj_XLKmu1DyR1eY7zq8UgeRKbA7yVLA",
  id: "XMbOEya1gUUO1ir4",
  requestBody: {
    key: "GITHUB_APP_ID",
    target: [
      "preview",
    ],
    gitBranch: "feature-1",
    type: "plain",
    value: "bkWIjbnxcvo78",
    customEnvironmentIds: [
      "env_1234567890",
    ],
    comment: "database connection string for production",
  },
};
```

## Fields

| Field                                                                                        | Type                                                                                         | Required                                                                                     | Description                                                                                  | Example                                                                                      |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `idOrName`                                                                                   | *string*                                                                                     | :heavy_check_mark:                                                                           | The unique project identifier or the project name                                            | prj_XLKmu1DyR1eY7zq8UgeRKbA7yVLA                                                             |
| `id`                                                                                         | *string*                                                                                     | :heavy_check_mark:                                                                           | The unique environment variable identifier                                                   | XMbOEya1gUUO1ir4                                                                             |
| `teamId`                                                                                     | *string*                                                                                     | :heavy_minus_sign:                                                                           | The Team identifier to perform the request on behalf of.                                     |                                                                                              |
| `slug`                                                                                       | *string*                                                                                     | :heavy_minus_sign:                                                                           | The Team slug to perform the request on behalf of.                                           |                                                                                              |
| `requestBody`                                                                                | [operations.EditProjectEnvRequestBody](../../models/operations/editprojectenvrequestbody.md) | :heavy_minus_sign:                                                                           | N/A                                                                                          |                                                                                              |