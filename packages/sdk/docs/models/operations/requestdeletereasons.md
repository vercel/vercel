# RequestDeleteReasons

An object describing the reason why the User account is being deleted.

## Example Usage

```typescript
import { RequestDeleteReasons } from "@vercel/sdk/models/operations/requestdelete.js";

let value: RequestDeleteReasons = {
  slug: "<value>",
  description: "aw opera not junior gadzooks despite vainly",
};
```

## Fields

| Field                                                                 | Type                                                                  | Required                                                              | Description                                                           |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `slug`                                                                | *string*                                                              | :heavy_check_mark:                                                    | Idenitifier slug of the reason why the User account is being deleted. |
| `description`                                                         | *string*                                                              | :heavy_check_mark:                                                    | Description of the reason why the User account is being deleted.      |