# PatchDomainRequest

## Example Usage

```typescript
import { PatchDomainRequest } from '@vercel/client/models/operations';

let value: PatchDomainRequest = {
  domain: 'only-tussle.net',
  requestBody: {
    op: 'move-out',
  },
};
```

## Fields

| Field         | Type                                | Required           | Description                                              |
| ------------- | ----------------------------------- | ------------------ | -------------------------------------------------------- |
| `domain`      | _string_                            | :heavy_check_mark: | N/A                                                      |
| `teamId`      | _string_                            | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |
| `slug`        | _string_                            | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |
| `requestBody` | _operations.PatchDomainRequestBody_ | :heavy_minus_sign: | N/A                                                      |
