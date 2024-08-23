# ArtifactExistsRequest

## Example Usage

```typescript
import { ArtifactExistsRequest } from '@vercel/client/models/operations';

let value: ArtifactExistsRequest = {
  hash: '12HKQaOmR5t5Uy6vdcQsNIiZgHGB',
};
```

## Fields

| Field    | Type     | Required           | Description                                              | Example                      |
| -------- | -------- | ------------------ | -------------------------------------------------------- | ---------------------------- |
| `hash`   | _string_ | :heavy_check_mark: | The artifact hash                                        | 12HKQaOmR5t5Uy6vdcQsNIiZgHGB |
| `teamId` | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |                              |
| `slug`   | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |                              |
