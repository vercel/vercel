# FileTree

A deployment file tree entry

## Example Usage

```typescript
import { FileTree } from "@vercel/sdk/models/components";

let value: FileTree = {
  name: "my-file.json",
  type: "file",
  uid: "2d4aad419917f15b1146e9e03ddc9bb31747e4d0",
  children: [],
  contentType: "application/json",
  mode: 5149.93,
};
```

## Fields

| Field                                                                             | Type                                                                              | Required                                                                          | Description                                                                       | Example                                                                           |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `name`                                                                            | *string*                                                                          | :heavy_check_mark:                                                                | The name of the file tree entry                                                   | my-file.json                                                                      |
| `type`                                                                            | [components.Type](../../models/components/type.md)                                | :heavy_check_mark:                                                                | String indicating the type of file tree entry.                                    | file                                                                              |
| `uid`                                                                             | *string*                                                                          | :heavy_minus_sign:                                                                | The unique identifier of the file (only valid for the `file` type)                | 2d4aad419917f15b1146e9e03ddc9bb31747e4d0                                          |
| `children`                                                                        | [components.FileTree](../../models/components/filetree.md)[]                      | :heavy_minus_sign:                                                                | The list of children files of the directory (only valid for the `directory` type) |                                                                                   |
| `contentType`                                                                     | *string*                                                                          | :heavy_minus_sign:                                                                | The content-type of the file (only valid for the `file` type)                     | application/json                                                                  |
| `mode`                                                                            | *number*                                                                          | :heavy_check_mark:                                                                | The file "mode" indicating file type and permissions.                             |                                                                                   |
| `symlink`                                                                         | *string*                                                                          | :heavy_minus_sign:                                                                | Not currently used. See `file-list-to-tree.ts`.                                   |                                                                                   |