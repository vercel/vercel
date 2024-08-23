# GetEdgeConfigTokenRequest

## Example Usage

```typescript
import { GetEdgeConfigTokenRequest } from '@vercel/client/models/operations';

let value: GetEdgeConfigTokenRequest = {
  edgeConfigId: '<value>',
  token: '<value>',
};
```

## Fields

| Field          | Type     | Required           | Description                                              |
| -------------- | -------- | ------------------ | -------------------------------------------------------- |
| `edgeConfigId` | _string_ | :heavy_check_mark: | N/A                                                      |
| `token`        | _string_ | :heavy_check_mark: | N/A                                                      |
| `teamId`       | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |
| `slug`         | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |
