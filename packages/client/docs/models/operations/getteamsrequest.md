# GetTeamsRequest

## Example Usage

```typescript
import { GetTeamsRequest } from '@vercel/client/models/operations';

let value: GetTeamsRequest = {
  limit: 20,
  since: 1540095775951,
  until: 1540095775951,
};
```

## Fields

| Field   | Type     | Required           | Description                                                           | Example       |
| ------- | -------- | ------------------ | --------------------------------------------------------------------- | ------------- |
| `limit` | _number_ | :heavy_minus_sign: | Maximum number of Teams which may be returned.                        | 20            |
| `since` | _number_ | :heavy_minus_sign: | Timestamp (in milliseconds) to only include Teams created since then. | 1540095775951 |
| `until` | _number_ | :heavy_minus_sign: | Timestamp (in milliseconds) to only include Teams created until then. | 1540095775951 |
