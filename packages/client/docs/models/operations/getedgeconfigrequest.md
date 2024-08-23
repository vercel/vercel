# GetEdgeConfigRequest

## Example Usage

```typescript
import { GetEdgeConfigRequest } from '@vercel/client/models/operations';

let value: GetEdgeConfigRequest = {
  edgeConfigId: '<value>',
};
```

## Fields

| Field          | Type     | Required           | Description                                              |
| -------------- | -------- | ------------------ | -------------------------------------------------------- |
| `edgeConfigId` | _string_ | :heavy_check_mark: | N/A                                                      |
| `teamId`       | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |
| `slug`         | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |
