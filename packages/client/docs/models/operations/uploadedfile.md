# UploadedFile

Used in the case you want to reference a file that was already uploaded

## Example Usage

```typescript
import { UploadedFile } from '@vercel/client/models/operations';

let value: UploadedFile = {
  file: 'folder/file.js',
};
```

## Fields

| Field  | Type     | Required           | Description                                                     | Example        |
| ------ | -------- | ------------------ | --------------------------------------------------------------- | -------------- |
| `file` | _string_ | :heavy_check_mark: | The file path relative to the project root                      | folder/file.js |
| `sha`  | _string_ | :heavy_minus_sign: | The file contents hashed with SHA1, used to check the integrity |                |
| `size` | _number_ | :heavy_minus_sign: | The file size in bytes                                          |                |
