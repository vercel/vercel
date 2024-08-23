# CreateEdgeConfigTokenRequest

## Example Usage

```typescript
import { CreateEdgeConfigTokenRequest } from '@vercel/client/models/operations';

let value: CreateEdgeConfigTokenRequest = {
  edgeConfigId: '<value>',
};
```

## Fields

| Field          | Type                                                                                                       | Required           | Description                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------- |
| `edgeConfigId` | _string_                                                                                                   | :heavy_check_mark: | N/A                                                      |
| `teamId`       | _string_                                                                                                   | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |
| `slug`         | _string_                                                                                                   | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |
| `requestBody`  | [operations.CreateEdgeConfigTokenRequestBody](../../models/operations/createedgeconfigtokenrequestbody.md) | :heavy_minus_sign: | N/A                                                      |
