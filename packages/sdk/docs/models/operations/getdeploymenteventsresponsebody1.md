# GetDeploymentEventsResponseBody1

## Example Usage

```typescript
import { GetDeploymentEventsResponseBody1 } from "@vercel/sdk/models/operations";

let value: GetDeploymentEventsResponseBody1 = {
  created: 2965.56,
  date: 1210.59,
  deploymentId: "<value>",
  id: "<id>",
  info: {
    type: "<value>",
    name: "<value>",
  },
  serial: "<value>",
  type: "fatal",
};
```

## Fields

| Field                                                                      | Type                                                                       | Required                                                                   | Description                                                                |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `created`                                                                  | *number*                                                                   | :heavy_check_mark:                                                         | N/A                                                                        |
| `date`                                                                     | *number*                                                                   | :heavy_check_mark:                                                         | N/A                                                                        |
| `deploymentId`                                                             | *string*                                                                   | :heavy_check_mark:                                                         | N/A                                                                        |
| `id`                                                                       | *string*                                                                   | :heavy_check_mark:                                                         | N/A                                                                        |
| `info`                                                                     | [operations.Info](../../models/operations/info.md)                         | :heavy_check_mark:                                                         | N/A                                                                        |
| `proxy`                                                                    | [operations.Proxy](../../models/operations/proxy.md)                       | :heavy_minus_sign:                                                         | N/A                                                                        |
| `requestId`                                                                | *string*                                                                   | :heavy_minus_sign:                                                         | N/A                                                                        |
| `serial`                                                                   | *string*                                                                   | :heavy_check_mark:                                                         | N/A                                                                        |
| `statusCode`                                                               | *number*                                                                   | :heavy_minus_sign:                                                         | N/A                                                                        |
| `text`                                                                     | *string*                                                                   | :heavy_minus_sign:                                                         | N/A                                                                        |
| `type`                                                                     | [operations.ResponseBodyType](../../models/operations/responsebodytype.md) | :heavy_check_mark:                                                         | N/A                                                                        |