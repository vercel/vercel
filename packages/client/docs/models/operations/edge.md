# Edge

Exists if the output is an edge function.

## Example Usage

```typescript
import { Edge } from '@vercel/client/models/operations';

let value: Edge = {
  regions: ['<value>'],
};
```

## Fields

| Field     | Type       | Required           | Description                                                                                                                                                                                                 |
| --------- | ---------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `regions` | _string_[] | :heavy_check_mark: | The regions where the edge function will be invoked. Only exists if the edge function as a regional edge function, see: https://vercel.com/docs/concepts/edge-network/regions#setting-edge-function-regions |
