# RemoveProjectEnvRequest

## Example Usage

```typescript
import { RemoveProjectEnvRequest } from "@vercel/sdk/models/operations";

let value: RemoveProjectEnvRequest = {
  idOrName: "prj_XLKmu1DyR1eY7zq8UgeRKbA7yVLA",
  id: "XMbOEya1gUUO1ir4",
};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              | Example                                                  |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `idOrName`                                               | *string*                                                 | :heavy_check_mark:                                       | The unique project identifier or the project name        | prj_XLKmu1DyR1eY7zq8UgeRKbA7yVLA                         |
| `id`                                                     | *string*                                                 | :heavy_check_mark:                                       | The unique environment variable identifier               | XMbOEya1gUUO1ir4                                         |
| `teamId`                                                 | *string*                                                 | :heavy_minus_sign:                                       | The Team identifier to perform the request on behalf of. |                                                          |
| `slug`                                                   | *string*                                                 | :heavy_minus_sign:                                       | The Team slug to perform the request on behalf of.       |                                                          |