# GetProjectDomainRequest

## Example Usage

```typescript
import { GetProjectDomainRequest } from '@vercel/client/models/operations';

let value: GetProjectDomainRequest = {
  idOrName: '<value>',
  domain: 'www.example.com',
};
```

## Fields

| Field      | Type     | Required           | Description                                              | Example         |
| ---------- | -------- | ------------------ | -------------------------------------------------------- | --------------- |
| `idOrName` | _string_ | :heavy_check_mark: | The unique project identifier or the project name        |                 |
| `domain`   | _string_ | :heavy_check_mark: | The project domain name                                  | www.example.com |
| `teamId`   | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |                 |
| `slug`     | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |                 |
