# GetConfigurationRequest

## Example Usage

```typescript
import { GetConfigurationRequest } from '@vercel/client/models/operations';

let value: GetConfigurationRequest = {
  id: 'icfg_cuwj0AdCdH3BwWT4LPijCC7t',
};
```

## Fields

| Field    | Type     | Required           | Description                                              | Example                       |
| -------- | -------- | ------------------ | -------------------------------------------------------- | ----------------------------- |
| `id`     | _string_ | :heavy_check_mark: | ID of the configuration to check                         | icfg_cuwj0AdCdH3BwWT4LPijCC7t |
| `teamId` | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |                               |
| `slug`   | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |                               |
