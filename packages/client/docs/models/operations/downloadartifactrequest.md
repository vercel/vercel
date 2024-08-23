# DownloadArtifactRequest

## Example Usage

```typescript
import { DownloadArtifactRequest } from '@vercel/client/models/operations';

let value: DownloadArtifactRequest = {
  xArtifactClientCi: 'VERCEL',
  xArtifactClientInteractive: 0,
  hash: '12HKQaOmR5t5Uy6vdcQsNIiZgHGB',
};
```

## Fields

| Field                        | Type     | Required           | Description                                                                           | Example                      |
| ---------------------------- | -------- | ------------------ | ------------------------------------------------------------------------------------- | ---------------------------- |
| `xArtifactClientCi`          | _string_ | :heavy_minus_sign: | The continuous integration or delivery environment where this artifact is downloaded. | VERCEL                       |
| `xArtifactClientInteractive` | _number_ | :heavy_minus_sign: | 1 if the client is an interactive shell. Otherwise 0                                  | 0                            |
| `hash`                       | _string_ | :heavy_check_mark: | The artifact hash                                                                     | 12HKQaOmR5t5Uy6vdcQsNIiZgHGB |
| `teamId`                     | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of.                              |                              |
| `slug`                       | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.                                    |                              |
