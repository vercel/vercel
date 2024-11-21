# Scopes1

The access scopes granted to the token.

## Example Usage

```typescript
import { Scopes1 } from "@vercel/sdk/models/components/authtoken.js";

let value: Scopes1 = {
  type: "user",
  origin: "email",
  createdAt: 2343.83,
};
```

## Fields

| Field                                                                            | Type                                                                             | Required                                                                         | Description                                                                      |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `type`                                                                           | [components.AuthTokenScopesType](../../models/components/authtokenscopestype.md) | :heavy_check_mark:                                                               | N/A                                                                              |
| `origin`                                                                         | [components.ScopesOrigin](../../models/components/scopesorigin.md)               | :heavy_check_mark:                                                               | N/A                                                                              |
| `createdAt`                                                                      | *number*                                                                         | :heavy_check_mark:                                                               | N/A                                                                              |
| `expiresAt`                                                                      | *number*                                                                         | :heavy_minus_sign:                                                               | N/A                                                                              |