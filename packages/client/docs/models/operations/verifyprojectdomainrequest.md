# VerifyProjectDomainRequest

## Example Usage

```typescript
import { VerifyProjectDomainRequest } from '@vercel/client/models/operations';

let value: VerifyProjectDomainRequest = {
  idOrName: 'prj_12HKQaOmR5t5Uy6vdcQsNIiZgHGB',
  domain: 'example.com',
};
```

## Fields

| Field      | Type     | Required           | Description                                              | Example                          |
| ---------- | -------- | ------------------ | -------------------------------------------------------- | -------------------------------- |
| `idOrName` | _string_ | :heavy_check_mark: | The unique project identifier or the project name        | prj_12HKQaOmR5t5Uy6vdcQsNIiZgHGB |
| `domain`   | _string_ | :heavy_check_mark: | The domain name you want to verify                       | example.com                      |
| `teamId`   | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |                                  |
| `slug`     | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |                                  |
