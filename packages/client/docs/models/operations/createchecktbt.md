# CreateCheckTBT

## Example Usage

```typescript
import { CreateCheckTBT } from '@vercel/client/models/operations';

let value: CreateCheckTBT = {
  value: 7742.34,
  source: 'web-vitals',
};
```

## Fields

| Field           | Type                                                                                                           | Required           | Description |
| --------------- | -------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `value`         | _number_                                                                                                       | :heavy_check_mark: | N/A         |
| `previousValue` | _number_                                                                                                       | :heavy_minus_sign: | N/A         |
| `source`        | [operations.CreateCheckChecksResponse200Source](../../models/operations/createcheckchecksresponse200source.md) | :heavy_check_mark: | N/A         |
