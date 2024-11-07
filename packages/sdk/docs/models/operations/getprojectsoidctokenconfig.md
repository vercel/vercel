# GetProjectsOidcTokenConfig

## Example Usage

```typescript
import { GetProjectsOidcTokenConfig } from "@vercel/sdk/models/operations/getprojects.js";

let value: GetProjectsOidcTokenConfig = {
  enabled: false,
};
```

## Fields

| Field                                                                                | Type                                                                                 | Required                                                                             | Description                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `enabled`                                                                            | *boolean*                                                                            | :heavy_check_mark:                                                                   | N/A                                                                                  |
| `issuerMode`                                                                         | [operations.GetProjectsIssuerMode](../../models/operations/getprojectsissuermode.md) | :heavy_minus_sign:                                                                   | - team: `https://oidc.vercel.com/[team_slug]` - global: `https://oidc.vercel.com`    |