# GetDomainTransferRequest

## Example Usage

```typescript
import { GetDomainTransferRequest } from '@vercel/client/models/operations';

let value: GetDomainTransferRequest = {
  domain: 'example.com',
};
```

## Fields

| Field    | Type     | Required           | Description                                              | Example     |
| -------- | -------- | ------------------ | -------------------------------------------------------- | ----------- |
| `teamId` | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |             |
| `slug`   | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |             |
| `domain` | _string_ | :heavy_check_mark: | N/A                                                      | example.com |
