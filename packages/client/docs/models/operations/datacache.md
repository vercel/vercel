# DataCache

## Example Usage

```typescript
import { DataCache } from '@vercel/client/models/operations';

let value: DataCache = {
  userDisabled: false,
};
```

## Fields

| Field              | Type      | Required           | Description |
| ------------------ | --------- | ------------------ | ----------- |
| `userDisabled`     | _boolean_ | :heavy_check_mark: | N/A         |
| `storageSizeBytes` | _number_  | :heavy_minus_sign: | N/A         |
| `unlimited`        | _boolean_ | :heavy_minus_sign: | N/A         |
