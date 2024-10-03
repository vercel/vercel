# Reasons

An object describing the reason why the team is being deleted.

## Example Usage

```typescript
import { Reasons } from "@vercel/sdk/models/operations/deleteteam.js";

let value: Reasons = {
  slug: "<value>",
  description: "inexperienced whup terrorise categorise putrid",
};
```

## Fields

| Field                                                         | Type                                                          | Required                                                      | Description                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| `slug`                                                        | *string*                                                      | :heavy_check_mark:                                            | Idenitifier slug of the reason why the team is being deleted. |
| `description`                                                 | *string*                                                      | :heavy_check_mark:                                            | Description of the reason why the team is being deleted.      |