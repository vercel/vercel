# DownloadArtifactRequest

## Example Usage

```typescript
import { DownloadArtifactRequest } from "@vercel/sdk/models/operations";

let value: DownloadArtifactRequest = {
  xArtifactClientCi: "VERCEL",
  xArtifactClientInteractive: 0,
  hash: "12HKQaOmR5t5Uy6vdcQsNIiZgHGB",
};
```

## Fields

| Field                                                                                 | Type                                                                                  | Required                                                                              | Description                                                                           | Example                                                                               |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `xArtifactClientCi`                                                                   | *string*                                                                              | :heavy_minus_sign:                                                                    | The continuous integration or delivery environment where this artifact is downloaded. | VERCEL                                                                                |
| `xArtifactClientInteractive`                                                          | *number*                                                                              | :heavy_minus_sign:                                                                    | 1 if the client is an interactive shell. Otherwise 0                                  | 0                                                                                     |
| `hash`                                                                                | *string*                                                                              | :heavy_check_mark:                                                                    | The artifact hash                                                                     | 12HKQaOmR5t5Uy6vdcQsNIiZgHGB                                                          |
| `teamId`                                                                              | *string*                                                                              | :heavy_minus_sign:                                                                    | The Team identifier to perform the request on behalf of.                              |                                                                                       |
| `slug`                                                                                | *string*                                                                              | :heavy_minus_sign:                                                                    | The Team slug to perform the request on behalf of.                                    |                                                                                       |