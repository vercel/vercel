# UpdateProjectProjectsOidcTokenConfig

## Example Usage

```typescript
import { UpdateProjectProjectsOidcTokenConfig } from "@vercel/sdk/models/operations/updateproject.js";

let value: UpdateProjectProjectsOidcTokenConfig = {
  enabled: false,
};
```

## Fields

| Field                                                                                                    | Type                                                                                                     | Required                                                                                                 | Description                                                                                              |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `enabled`                                                                                                | *boolean*                                                                                                | :heavy_check_mark:                                                                                       | N/A                                                                                                      |
| `issuerMode`                                                                                             | [operations.UpdateProjectProjectsIssuerMode](../../models/operations/updateprojectprojectsissuermode.md) | :heavy_minus_sign:                                                                                       | - team: `https://oidc.vercel.com/[team_slug]` - global: `https://oidc.vercel.com`                        |