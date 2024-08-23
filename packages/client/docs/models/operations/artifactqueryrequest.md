# ArtifactQueryRequest

## Example Usage

```typescript
import { ArtifactQueryRequest } from '@vercel/client/models/operations';

let value: ArtifactQueryRequest = {};
```

## Fields

| Field         | Type                                                                                       | Required           | Description                                              |
| ------------- | ------------------------------------------------------------------------------------------ | ------------------ | -------------------------------------------------------- |
| `teamId`      | _string_                                                                                   | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |
| `slug`        | _string_                                                                                   | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |
| `requestBody` | [operations.ArtifactQueryRequestBody](../../models/operations/artifactqueryrequestbody.md) | :heavy_minus_sign: | N/A                                                      |
