# Scopes2

The access scopes granted to the token.

## Example Usage

```typescript
import { Scopes2 } from "@vercel/sdk/models/components/authtoken.js";

let value: Scopes2 = {
  type: "team",
  teamId: "<id>",
  origin: "saml",
  createdAt: 896.42,
};
```

## Fields

| Field                                                                                | Type                                                                                 | Required                                                                             | Description                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `type`                                                                               | [components.AuthTokenScopesType](../../models/components/authtokenscopestype.md)     | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `teamId`                                                                             | *string*                                                                             | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `origin`                                                                             | [components.AuthTokenScopesOrigin](../../models/components/authtokenscopesorigin.md) | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `createdAt`                                                                          | *number*                                                                             | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `expiresAt`                                                                          | *number*                                                                             | :heavy_minus_sign:                                                                   | N/A                                                                                  |