# PatchEdgeConfigSchemaRequest

## Example Usage

```typescript
import { PatchEdgeConfigSchemaRequest } from '@vercel/client/models/operations';

let value: PatchEdgeConfigSchemaRequest = {
  edgeConfigId: '<value>',
};
```

## Fields

| Field          | Type                                                                                                       | Required           | Description                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------- |
| `edgeConfigId` | _string_                                                                                                   | :heavy_check_mark: | N/A                                                      |
| `dryRun`       | _string_                                                                                                   | :heavy_minus_sign: | N/A                                                      |
| `teamId`       | _string_                                                                                                   | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |
| `slug`         | _string_                                                                                                   | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |
| `requestBody`  | [operations.PatchEdgeConfigSchemaRequestBody](../../models/operations/patchedgeconfigschemarequestbody.md) | :heavy_minus_sign: | N/A                                                      |
