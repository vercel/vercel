# OidcTokenConfig

OpenID Connect JSON Web Token generation configuration.

## Example Usage

```typescript
import { OidcTokenConfig } from "@vercel/sdk/models/operations";

let value: OidcTokenConfig = {
  enabled: false,
};
```

## Fields

| Field                                                      | Type                                                       | Required                                                   | Description                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `enabled`                                                  | *boolean*                                                  | :heavy_check_mark:                                         | Whether or not to generate OpenID Connect JSON Web Tokens. |