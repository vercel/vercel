# GetDeploymentEventsRequest

## Example Usage

```typescript
import { GetDeploymentEventsRequest } from "@vercel/sdk/models/operations";

let value: GetDeploymentEventsRequest = {
  idOrUrl: "dpl_5WJWYSyB7BpgTj3EuwF37WMRBXBtPQ2iTMJHJBJyRfd",
  direction: "backward",
  follow: 1,
  limit: 100,
  name: "bld_cotnkcr76",
  since: 1540095775941,
  until: 1540106318643,
  statusCode: "5xx",
  delimiter: 1,
  builds: 1,
};
```

## Fields

| Field                                                                          | Type                                                                           | Required                                                                       | Description                                                                    | Example                                                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `idOrUrl`                                                                      | *string*                                                                       | :heavy_check_mark:                                                             | The unique identifier or hostname of the deployment.                           | dpl_5WJWYSyB7BpgTj3EuwF37WMRBXBtPQ2iTMJHJBJyRfd                                |
| `direction`                                                                    | [operations.Direction](../../models/operations/direction.md)                   | :heavy_minus_sign:                                                             | Order of the returned events based on the timestamp.                           | backward                                                                       |
| `follow`                                                                       | *number*                                                                       | :heavy_minus_sign:                                                             | When enabled, this endpoint will return live events as they happen.            | 1                                                                              |
| `limit`                                                                        | *number*                                                                       | :heavy_minus_sign:                                                             | Maximum number of events to return. Provide `-1` to return all available logs. | 100                                                                            |
| `name`                                                                         | *string*                                                                       | :heavy_minus_sign:                                                             | Deployment build ID.                                                           | bld_cotnkcr76                                                                  |
| `since`                                                                        | *number*                                                                       | :heavy_minus_sign:                                                             | Timestamp for when build logs should be pulled from.                           | 1540095775941                                                                  |
| `until`                                                                        | *number*                                                                       | :heavy_minus_sign:                                                             | Timestamp for when the build logs should be pulled up until.                   | 1540106318643                                                                  |
| `statusCode`                                                                   | *operations.StatusCode*                                                        | :heavy_minus_sign:                                                             | HTTP status code range to filter events by.                                    | 5xx                                                                            |
| `delimiter`                                                                    | *number*                                                                       | :heavy_minus_sign:                                                             | N/A                                                                            | 1                                                                              |
| `builds`                                                                       | *number*                                                                       | :heavy_minus_sign:                                                             | N/A                                                                            | 1                                                                              |
| `teamId`                                                                       | *string*                                                                       | :heavy_minus_sign:                                                             | The Team identifier to perform the request on behalf of.                       |                                                                                |
| `slug`                                                                         | *string*                                                                       | :heavy_minus_sign:                                                             | The Team slug to perform the request on behalf of.                             |                                                                                |