# DeleteEdgeConfigTokensRequest

## Example Usage

```typescript
import { DeleteEdgeConfigTokensRequest } from "@vercel/sdk/models/operations/deleteedgeconfigtokens.js";

let value: DeleteEdgeConfigTokensRequest = {
  edgeConfigId: "<id>",
};
```

## Fields

| Field                                                                                                        | Type                                                                                                         | Required                                                                                                     | Description                                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `edgeConfigId`                                                                                               | *string*                                                                                                     | :heavy_check_mark:                                                                                           | N/A                                                                                                          |
| `teamId`                                                                                                     | *string*                                                                                                     | :heavy_minus_sign:                                                                                           | The Team identifier to perform the request on behalf of.                                                     |
| `slug`                                                                                                       | *string*                                                                                                     | :heavy_minus_sign:                                                                                           | The Team slug to perform the request on behalf of.                                                           |
| `requestBody`                                                                                                | [operations.DeleteEdgeConfigTokensRequestBody](../../models/operations/deleteedgeconfigtokensrequestbody.md) | :heavy_minus_sign:                                                                                           | N/A                                                                                                          |