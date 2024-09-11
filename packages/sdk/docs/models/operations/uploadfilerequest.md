# UploadFileRequest

## Example Usage

```typescript
import { UploadFileRequest } from "@vercel/sdk/models/operations";

let value: UploadFileRequest = {};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `contentLength`                                          | *number*                                                 | :heavy_minus_sign:                                       | The file size in bytes                                   |
| `xVercelDigest`                                          | *string*                                                 | :heavy_minus_sign:                                       | The file SHA1 used to check the integrity                |
| `xNowDigest`                                             | *string*                                                 | :heavy_minus_sign:                                       | The file SHA1 used to check the integrity                |
| `xNowSize`                                               | *number*                                                 | :heavy_minus_sign:                                       | The file size as an alternative to `Content-Length`      |
| `teamId`                                                 | *string*                                                 | :heavy_minus_sign:                                       | The Team identifier to perform the request on behalf of. |
| `slug`                                                   | *string*                                                 | :heavy_minus_sign:                                       | The Team slug to perform the request on behalf of.       |