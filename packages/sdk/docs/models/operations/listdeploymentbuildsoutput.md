# ListDeploymentBuildsOutput

A list of outputs for the Build that can be either Serverless Functions or static files

## Example Usage

```typescript
import { ListDeploymentBuildsOutput } from "@vercel/sdk/models/operations";

let value: ListDeploymentBuildsOutput = {
  path: "/usr/bin",
  digest: "<value>",
  mode: 8442.66,
};
```

## Fields

| Field                                                                                                           | Type                                                                                                            | Required                                                                                                        | Description                                                                                                     |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `type`                                                                                                          | [operations.ListDeploymentBuildsType](../../models/operations/listdeploymentbuildstype.md)                      | :heavy_minus_sign:                                                                                              | The type of the output                                                                                          |
| `path`                                                                                                          | *string*                                                                                                        | :heavy_check_mark:                                                                                              | The absolute path of the file or Serverless Function                                                            |
| `digest`                                                                                                        | *string*                                                                                                        | :heavy_check_mark:                                                                                              | The SHA1 of the file                                                                                            |
| `mode`                                                                                                          | *number*                                                                                                        | :heavy_check_mark:                                                                                              | The POSIX file permissions                                                                                      |
| `size`                                                                                                          | *number*                                                                                                        | :heavy_minus_sign:                                                                                              | The size of the file in bytes                                                                                   |
| `lambda`                                                                                                        | [operations.Lambda](../../models/operations/lambda.md)                                                          | :heavy_minus_sign:                                                                                              | If the output is a Serverless Function, an object containing the name, location and memory size of the function |
| `edge`                                                                                                          | [operations.Edge](../../models/operations/edge.md)                                                              | :heavy_minus_sign:                                                                                              | Exists if the output is an edge function.                                                                       |