# Reasons

An object describing the reason why the team is being deleted.

## Example Usage

```typescript
import { Reasons } from "@vercel/sdk/models/operations";

let value: Reasons = {
  slug: "<value>",
  description: "Re-contextualized responsive protocol",
};
```

## Fields

| Field                                                         | Type                                                          | Required                                                      | Description                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| `slug`                                                        | *string*                                                      | :heavy_check_mark:                                            | Idenitifier slug of the reason why the team is being deleted. |
| `description`                                                 | *string*                                                      | :heavy_check_mark:                                            | Description of the reason why the team is being deleted.      |