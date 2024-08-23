# Scopes1

The access scopes granted to the token.

## Example Usage

```typescript
import { Scopes1 } from '@vercel/client/models/components';

let value: Scopes1 = {
  type: 'user',
  origin: 'manual',
  createdAt: 2659.05,
};
```

## Fields

| Field       | Type                                                               | Required           | Description |
| ----------- | ------------------------------------------------------------------ | ------------------ | ----------- |
| `type`      | [components.ScopesType](../../models/components/scopestype.md)     | :heavy_check_mark: | N/A         |
| `origin`    | [components.ScopesOrigin](../../models/components/scopesorigin.md) | :heavy_check_mark: | N/A         |
| `createdAt` | _number_                                                           | :heavy_check_mark: | N/A         |
| `expiresAt` | _number_                                                           | :heavy_minus_sign: | N/A         |
