# UpdateCheckLCP

## Example Usage

```typescript
import { UpdateCheckLCP } from '@vercel/client/models/operations';

let value: UpdateCheckLCP = {
  value: 6527.9,
  source: 'web-vitals',
};
```

## Fields

| Field           | Type                                                                                                           | Required           | Description |
| --------------- | -------------------------------------------------------------------------------------------------------------- | ------------------ | ----------- |
| `value`         | _number_                                                                                                       | :heavy_check_mark: | N/A         |
| `previousValue` | _number_                                                                                                       | :heavy_minus_sign: | N/A         |
| `source`        | [operations.UpdateCheckChecksResponse200Source](../../models/operations/updatecheckchecksresponse200source.md) | :heavy_check_mark: | N/A         |
