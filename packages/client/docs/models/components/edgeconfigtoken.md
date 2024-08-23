# EdgeConfigToken

The EdgeConfig.

## Example Usage

```typescript
import { EdgeConfigToken } from '@vercel/client/models/components';

let value: EdgeConfigToken = {
  token: '<value>',
  label: '<value>',
  id: '<id>',
  edgeConfigId: '<value>',
  createdAt: 3041.73,
};
```

## Fields

| Field          | Type     | Required           | Description                                                             |
| -------------- | -------- | ------------------ | ----------------------------------------------------------------------- |
| `token`        | _string_ | :heavy_check_mark: | N/A                                                                     |
| `label`        | _string_ | :heavy_check_mark: | N/A                                                                     |
| `id`           | _string_ | :heavy_check_mark: | This is not the token itself, but rather an id to identify the token by |
| `edgeConfigId` | _string_ | :heavy_check_mark: | N/A                                                                     |
| `createdAt`    | _number_ | :heavy_check_mark: | N/A                                                                     |
