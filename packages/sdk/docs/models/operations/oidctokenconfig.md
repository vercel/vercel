# OidcTokenConfig

OpenID Connect JSON Web Token generation configuration.

## Example Usage

```typescript
import { OidcTokenConfig } from "@vercel/sdk/models/operations/createproject.js";

let value: OidcTokenConfig = {
  enabled: false,
};
```

## Fields

| Field                                                                         | Type                                                                          | Required                                                                      | Description                                                                   |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `enabled`                                                                     | *boolean*                                                                     | :heavy_check_mark:                                                            | Whether or not to generate OpenID Connect JSON Web Tokens.                    |
| `issuerMode`                                                                  | [operations.IssuerMode](../../models/operations/issuermode.md)                | :heavy_minus_sign:                                                            | team: `https://oidc.vercel.com/[team_slug]` global: `https://oidc.vercel.com` |