# CreateEdgeConfigRequest

## Example Usage

```typescript
import { CreateEdgeConfigRequest } from "@vercel/sdk/models/operations";

let value: CreateEdgeConfigRequest = {};
```

## Fields

| Field                                                                                            | Type                                                                                             | Required                                                                                         | Description                                                                                      |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `teamId`                                                                                         | *string*                                                                                         | :heavy_minus_sign:                                                                               | The Team identifier to perform the request on behalf of.                                         |
| `slug`                                                                                           | *string*                                                                                         | :heavy_minus_sign:                                                                               | The Team slug to perform the request on behalf of.                                               |
| `requestBody`                                                                                    | [operations.CreateEdgeConfigRequestBody](../../models/operations/createedgeconfigrequestbody.md) | :heavy_minus_sign:                                                                               | N/A                                                                                              |