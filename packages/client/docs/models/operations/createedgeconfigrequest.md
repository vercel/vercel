# CreateEdgeConfigRequest

## Example Usage

```typescript
import { CreateEdgeConfigRequest } from '@vercel/client/models/operations';

let value: CreateEdgeConfigRequest = {};
```

## Fields

| Field         | Type                                                                                             | Required           | Description                                              |
| ------------- | ------------------------------------------------------------------------------------------------ | ------------------ | -------------------------------------------------------- |
| `teamId`      | _string_                                                                                         | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |
| `slug`        | _string_                                                                                         | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |
| `requestBody` | [operations.CreateEdgeConfigRequestBody](../../models/operations/createedgeconfigrequestbody.md) | :heavy_minus_sign: | N/A                                                      |
