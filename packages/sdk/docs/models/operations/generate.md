# Generate

Generate a new secret. If neither generate or revoke are provided, a new random secret will be generated.

## Example Usage

```typescript
import { Generate } from "@vercel/sdk/models/operations/updateprojectprotectionbypass.js";

let value: Generate = {};
```

## Fields

| Field                                    | Type                                     | Required                                 | Description                              |
| ---------------------------------------- | ---------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| `secret`                                 | *string*                                 | :heavy_minus_sign:                       | Optional value of the secret to generate |