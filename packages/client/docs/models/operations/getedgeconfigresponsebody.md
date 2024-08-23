# GetEdgeConfigResponseBody

The EdgeConfig.

## Example Usage

```typescript
import { GetEdgeConfigResponseBody } from '@vercel/client/models/operations';

let value: GetEdgeConfigResponseBody = {
  sizeInBytes: 5241.84,
  itemCount: 7963.2,
};
```

## Fields

| Field         | Type                                                                                 | Required           | Description                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createdAt`   | _number_                                                                             | :heavy_minus_sign: | N/A                                                                                                                                                   |
| `updatedAt`   | _number_                                                                             | :heavy_minus_sign: | N/A                                                                                                                                                   |
| `id`          | _string_                                                                             | :heavy_minus_sign: | N/A                                                                                                                                                   |
| `slug`        | _string_                                                                             | :heavy_minus_sign: | Name for the Edge Config Names are not unique. Must start with an alphabetic character and can contain only alphanumeric characters and underscores). |
| `ownerId`     | _string_                                                                             | :heavy_minus_sign: | N/A                                                                                                                                                   |
| `digest`      | _string_                                                                             | :heavy_minus_sign: | N/A                                                                                                                                                   |
| `transfer`    | [operations.GetEdgeConfigTransfer](../../models/operations/getedgeconfigtransfer.md) | :heavy_minus_sign: | Keeps track of the current state of the Edge Config while it gets transferred.                                                                        |
| `schema`      | [operations.GetEdgeConfigSchema](../../models/operations/getedgeconfigschema.md)     | :heavy_minus_sign: | N/A                                                                                                                                                   |
| `sizeInBytes` | _number_                                                                             | :heavy_check_mark: | N/A                                                                                                                                                   |
| `itemCount`   | _number_                                                                             | :heavy_check_mark: | N/A                                                                                                                                                   |
