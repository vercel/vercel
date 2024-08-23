# FileTree

A deployment file tree entry

## Example Usage

```typescript
import { FileTree } from '@vercel/client/models/components';

let value: FileTree = {
  name: 'my-file.json',
  type: 'file',
  uid: '2d4aad419917f15b1146e9e03ddc9bb31747e4d0',
  children: [],
  contentType: 'application/json',
  mode: 4671.19,
};
```

## Fields

| Field         | Type                                                         | Required           | Description                                                                       | Example                                  |
| ------------- | ------------------------------------------------------------ | ------------------ | --------------------------------------------------------------------------------- | ---------------------------------------- |
| `name`        | _string_                                                     | :heavy_check_mark: | The name of the file tree entry                                                   | my-file.json                             |
| `type`        | [components.Type](../../models/components/type.md)           | :heavy_check_mark: | String indicating the type of file tree entry.                                    | file                                     |
| `uid`         | _string_                                                     | :heavy_minus_sign: | The unique identifier of the file (only valid for the `file` type)                | 2d4aad419917f15b1146e9e03ddc9bb31747e4d0 |
| `children`    | [components.FileTree](../../models/components/filetree.md)[] | :heavy_minus_sign: | The list of children files of the directory (only valid for the `directory` type) |                                          |
| `contentType` | _string_                                                     | :heavy_minus_sign: | The content-type of the file (only valid for the `file` type)                     | application/json                         |
| `mode`        | _number_                                                     | :heavy_check_mark: | The file "mode" indicating file type and permissions.                             |                                          |
| `symlink`     | _string_                                                     | :heavy_minus_sign: | Not currently used. See `file-list-to-tree.ts`.                                   |                                          |
