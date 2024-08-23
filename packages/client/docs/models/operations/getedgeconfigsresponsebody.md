# GetEdgeConfigsResponseBody

List of all edge configs.

## Example Usage

```typescript
import { GetEdgeConfigsResponseBody } from '@vercel/client/models/operations';

let value: GetEdgeConfigsResponseBody = {
  sizeInBytes: 9591.43,
  itemCount: 8892.88,
};
```

## Fields

| Field         | Type                                                       | Required           | Description                                                                                                                                           |
| ------------- | ---------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | _string_                                                   | :heavy_minus_sign: | N/A                                                                                                                                                   |
| `createdAt`   | _number_                                                   | :heavy_minus_sign: | N/A                                                                                                                                                   |
| `ownerId`     | _string_                                                   | :heavy_minus_sign: | N/A                                                                                                                                                   |
| `slug`        | _string_                                                   | :heavy_minus_sign: | Name for the Edge Config Names are not unique. Must start with an alphabetic character and can contain only alphanumeric characters and underscores). |
| `updatedAt`   | _number_                                                   | :heavy_minus_sign: | N/A                                                                                                                                                   |
| `digest`      | _string_                                                   | :heavy_minus_sign: | N/A                                                                                                                                                   |
| `transfer`    | [operations.Transfer](../../models/operations/transfer.md) | :heavy_minus_sign: | Keeps track of the current state of the Edge Config while it gets transferred.                                                                        |
| `schema`      | [operations.Schema](../../models/operations/schema.md)     | :heavy_minus_sign: | N/A                                                                                                                                                   |
| `sizeInBytes` | _number_                                                   | :heavy_check_mark: | N/A                                                                                                                                                   |
| `itemCount`   | _number_                                                   | :heavy_check_mark: | N/A                                                                                                                                                   |
