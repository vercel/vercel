# InlinedFile

Used in the case you want to inline a file inside the request

## Example Usage

```typescript
import { InlinedFile } from "@vercel/sdk/models/operations";

let value: InlinedFile = {
  data: "<value>",
  file: "folder/file.js",
};
```

## Fields

| Field                                                                                                                            | Type                                                                                                                             | Required                                                                                                                         | Description                                                                                                                      | Example                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `data`                                                                                                                           | *string*                                                                                                                         | :heavy_check_mark:                                                                                                               | The file content, it could be either a `base64` (useful for images, etc.) of the files or the plain content for source code      |                                                                                                                                  |
| `encoding`                                                                                                                       | [operations.Encoding](../../models/operations/encoding.md)                                                                       | :heavy_minus_sign:                                                                                                               | The file content encoding, it could be either a base64 (useful for images, etc.) of the files or the plain text for source code. |                                                                                                                                  |
| `file`                                                                                                                           | *string*                                                                                                                         | :heavy_check_mark:                                                                                                               | The file name including the whole path                                                                                           | folder/file.js                                                                                                                   |