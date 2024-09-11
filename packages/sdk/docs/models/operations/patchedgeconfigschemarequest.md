# PatchEdgeConfigSchemaRequest

## Example Usage

```typescript
import { PatchEdgeConfigSchemaRequest } from "@vercel/sdk/models/operations";

let value: PatchEdgeConfigSchemaRequest = {
  edgeConfigId: "<value>",
};
```

## Fields

| Field                                                                                                      | Type                                                                                                       | Required                                                                                                   | Description                                                                                                |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `edgeConfigId`                                                                                             | *string*                                                                                                   | :heavy_check_mark:                                                                                         | N/A                                                                                                        |
| `dryRun`                                                                                                   | *string*                                                                                                   | :heavy_minus_sign:                                                                                         | N/A                                                                                                        |
| `teamId`                                                                                                   | *string*                                                                                                   | :heavy_minus_sign:                                                                                         | The Team identifier to perform the request on behalf of.                                                   |
| `slug`                                                                                                     | *string*                                                                                                   | :heavy_minus_sign:                                                                                         | The Team slug to perform the request on behalf of.                                                         |
| `requestBody`                                                                                              | [operations.PatchEdgeConfigSchemaRequestBody](../../models/operations/patchedgeconfigschemarequestbody.md) | :heavy_minus_sign:                                                                                         | N/A                                                                                                        |