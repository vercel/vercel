# Revoke

Optional instructions for revoking and regenerating a automation bypass

## Example Usage

```typescript
import { Revoke } from "@vercel/sdk/models/operations";

let value: Revoke = {
  secret: "<value>",
  regenerate: false,
};
```

## Fields

| Field                                                                                         | Type                                                                                          | Required                                                                                      | Description                                                                                   |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `secret`                                                                                      | *string*                                                                                      | :heavy_check_mark:                                                                            | Automation bypass to revoked                                                                  |
| `regenerate`                                                                                  | *boolean*                                                                                     | :heavy_check_mark:                                                                            | Whether or not a new automation bypass should be created after the provided secret is revoked |