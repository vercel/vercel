# Scopes2

The access scopes granted to the token.

## Example Usage

```typescript
import { Scopes2 } from '@vercel/client/models/components';

let value: Scopes2 = {
  type: 'team',
  teamId: '<value>',
  origin: 'gitlab',
  createdAt: 2662.84,
};
```

## Fields

| Field       | Type                                                                                 | Required           | Description |
| ----------- | ------------------------------------------------------------------------------------ | ------------------ | ----------- |
| `type`      | [components.AuthTokenScopesType](../../models/components/authtokenscopestype.md)     | :heavy_check_mark: | N/A         |
| `teamId`    | _string_                                                                             | :heavy_check_mark: | N/A         |
| `origin`    | [components.AuthTokenScopesOrigin](../../models/components/authtokenscopesorigin.md) | :heavy_check_mark: | N/A         |
| `createdAt` | _number_                                                                             | :heavy_check_mark: | N/A         |
| `expiresAt` | _number_                                                                             | :heavy_minus_sign: | N/A         |
