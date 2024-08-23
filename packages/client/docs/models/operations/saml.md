# Saml

## Example Usage

```typescript
import { Saml } from '@vercel/client/models/operations';

let value: Saml = {
  enforced: true,
};
```

## Fields

| Field      | Type                               | Required           | Description                                               | Example |
| ---------- | ---------------------------------- | ------------------ | --------------------------------------------------------- | ------- |
| `enforced` | _boolean_                          | :heavy_minus_sign: | Require that members of the team use SAML Single Sign-On. | true    |
| `roles`    | Record<string, _operations.Roles_> | :heavy_minus_sign: | Directory groups to role or access group mappings.        |         |
