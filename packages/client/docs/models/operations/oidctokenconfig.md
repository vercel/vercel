# OidcTokenConfig

OpenID Connect JSON Web Token generation configuration.

## Example Usage

```typescript
import { OidcTokenConfig } from '@vercel/client/models/operations';

let value: OidcTokenConfig = {
  enabled: false,
};
```

## Fields

| Field     | Type      | Required           | Description                                                |
| --------- | --------- | ------------------ | ---------------------------------------------------------- |
| `enabled` | _boolean_ | :heavy_check_mark: | Whether or not to generate OpenID Connect JSON Web Tokens. |
