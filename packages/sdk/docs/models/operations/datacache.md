# DataCache

## Example Usage

```typescript
import { DataCache } from "@vercel/sdk/models/operations/updateprojectdatacache.js";

let value: DataCache = {
  userDisabled: false,
};
```

## Fields

| Field              | Type               | Required           | Description        |
| ------------------ | ------------------ | ------------------ | ------------------ |
| `userDisabled`     | *boolean*          | :heavy_check_mark: | N/A                |
| `storageSizeBytes` | *number*           | :heavy_minus_sign: | N/A                |
| `unlimited`        | *boolean*          | :heavy_minus_sign: | N/A                |