# UploadFileRequest

## Example Usage

```typescript
import { UploadFileRequest } from '@vercel/client/models/operations';

let value: UploadFileRequest = {};
```

## Fields

| Field           | Type     | Required           | Description                                              |
| --------------- | -------- | ------------------ | -------------------------------------------------------- |
| `contentLength` | _number_ | :heavy_minus_sign: | The file size in bytes                                   |
| `xVercelDigest` | _string_ | :heavy_minus_sign: | The file SHA1 used to check the integrity                |
| `xNowDigest`    | _string_ | :heavy_minus_sign: | The file SHA1 used to check the integrity                |
| `xNowSize`      | _number_ | :heavy_minus_sign: | The file size as an alternative to `Content-Length`      |
| `teamId`        | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |
| `slug`          | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |
