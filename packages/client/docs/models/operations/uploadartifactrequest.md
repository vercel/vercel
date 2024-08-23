# UploadArtifactRequest

## Example Usage

```typescript
import { UploadArtifactRequest } from '@vercel/client/models/operations';

let value: UploadArtifactRequest = {
  contentLength: 5373.73,
  xArtifactDuration: 400,
  xArtifactClientCi: 'VERCEL',
  xArtifactClientInteractive: 0,
  xArtifactTag: 'Tc0BmHvJYMIYJ62/zx87YqO0Flxk+5Ovip25NY825CQ=',
  hash: '12HKQaOmR5t5Uy6vdcQsNIiZgHGB',
};
```

## Fields

| Field                        | Type         | Required           | Description                                                                                                                                | Example                                      |
| ---------------------------- | ------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `contentLength`              | _number_     | :heavy_check_mark: | The artifact size in bytes                                                                                                                 |                                              |
| `xArtifactDuration`          | _number_     | :heavy_minus_sign: | The time taken to generate the uploaded artifact in milliseconds.                                                                          | 400                                          |
| `xArtifactClientCi`          | _string_     | :heavy_minus_sign: | The continuous integration or delivery environment where this artifact was generated.                                                      | VERCEL                                       |
| `xArtifactClientInteractive` | _number_     | :heavy_minus_sign: | 1 if the client is an interactive shell. Otherwise 0                                                                                       | 0                                            |
| `xArtifactTag`               | _string_     | :heavy_minus_sign: | The base64 encoded tag for this artifact. The value is sent back to clients when the artifact is downloaded as the header `x-artifact-tag` | Tc0BmHvJYMIYJ62/zx87YqO0Flxk+5Ovip25NY825CQ= |
| `hash`                       | _string_     | :heavy_check_mark: | The artifact hash                                                                                                                          | 12HKQaOmR5t5Uy6vdcQsNIiZgHGB                 |
| `teamId`                     | _string_     | :heavy_minus_sign: | The Team identifier to perform the request on behalf of.                                                                                   |                                              |
| `slug`                       | _string_     | :heavy_minus_sign: | The Team slug to perform the request on behalf of.                                                                                         |                                              |
| `requestBody`                | _Uint8Array_ | :heavy_minus_sign: | N/A                                                                                                                                        |                                              |
