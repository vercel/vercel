# CreateAuthTokenRequest

## Example Usage

```typescript
import { CreateAuthTokenRequest } from '@vercel/client/models/operations';

let value: CreateAuthTokenRequest = {};
```

## Fields

| Field         | Type                                    | Required           | Description                                              |
| ------------- | --------------------------------------- | ------------------ | -------------------------------------------------------- |
| `teamId`      | _string_                                | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |
| `slug`        | _string_                                | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |
| `requestBody` | _operations.CreateAuthTokenRequestBody_ | :heavy_minus_sign: | N/A                                                      |
