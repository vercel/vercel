# QueryParamDecrypt

Whether to try to decrypt the value of the secret. Only works if `decryptable` has been set to `true` when the secret was created.

## Example Usage

```typescript
import { QueryParamDecrypt } from "@vercel/sdk/models/operations";

let value: QueryParamDecrypt = "true";
```

## Values

```typescript
"true" | "false"
```