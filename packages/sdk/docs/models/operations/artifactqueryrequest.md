# ArtifactQueryRequest

## Example Usage

```typescript
import { ArtifactQueryRequest } from "@vercel/sdk/models/operations";

let value: ArtifactQueryRequest = {};
```

## Fields

| Field                                                                                      | Type                                                                                       | Required                                                                                   | Description                                                                                |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `teamId`                                                                                   | *string*                                                                                   | :heavy_minus_sign:                                                                         | The Team identifier to perform the request on behalf of.                                   |
| `slug`                                                                                     | *string*                                                                                   | :heavy_minus_sign:                                                                         | The Team slug to perform the request on behalf of.                                         |
| `requestBody`                                                                              | [operations.ArtifactQueryRequestBody](../../models/operations/artifactqueryrequestbody.md) | :heavy_minus_sign:                                                                         | N/A                                                                                        |