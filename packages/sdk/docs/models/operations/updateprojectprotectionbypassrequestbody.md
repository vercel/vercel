# UpdateProjectProtectionBypassRequestBody

## Example Usage

```typescript
import { UpdateProjectProtectionBypassRequestBody } from "@vercel/sdk/models/operations/updateprojectprotectionbypass.js";

let value: UpdateProjectProtectionBypassRequestBody = {};
```

## Fields

| Field                                                                                                     | Type                                                                                                      | Required                                                                                                  | Description                                                                                               |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `revoke`                                                                                                  | [operations.Revoke](../../models/operations/revoke.md)                                                    | :heavy_minus_sign:                                                                                        | Optional instructions for revoking and regenerating a automation bypass                                   |
| `generate`                                                                                                | [operations.Generate](../../models/operations/generate.md)                                                | :heavy_minus_sign:                                                                                        | Generate a new secret. If neither generate or revoke are provided, a new random secret will be generated. |