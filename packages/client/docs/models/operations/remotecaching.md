# RemoteCaching

Whether or not remote caching is enabled for the team

## Example Usage

```typescript
import { RemoteCaching } from '@vercel/client/models/operations';

let value: RemoteCaching = {
  enabled: true,
};
```

## Fields

| Field     | Type      | Required           | Description                                    | Example |
| --------- | --------- | ------------------ | ---------------------------------------------- | ------- |
| `enabled` | _boolean_ | :heavy_minus_sign: | Enable or disable remote caching for the team. | true    |
