# CheckDomainStatusRequest

## Example Usage

```typescript
import { CheckDomainStatusRequest } from '@vercel/client/models/operations';

let value: CheckDomainStatusRequest = {
  name: 'example.com',
};
```

## Fields

| Field    | Type     | Required           | Description                                                         | Example     |
| -------- | -------- | ------------------ | ------------------------------------------------------------------- | ----------- |
| `name`   | _string_ | :heavy_check_mark: | The name of the domain for which we would like to check the status. | example.com |
| `teamId` | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of.            |             |
| `slug`   | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.                  |             |
