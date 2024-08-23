# DeleteDomainRequest

## Example Usage

```typescript
import { DeleteDomainRequest } from '@vercel/client/models/operations';

let value: DeleteDomainRequest = {
  domain: 'example.com',
};
```

## Fields

| Field    | Type     | Required           | Description                                              | Example     |
| -------- | -------- | ------------------ | -------------------------------------------------------- | ----------- |
| `domain` | _string_ | :heavy_check_mark: | The name of the domain.                                  | example.com |
| `teamId` | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |             |
| `slug`   | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |             |
