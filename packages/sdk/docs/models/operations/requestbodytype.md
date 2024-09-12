# RequestBodyType

The type of record, it could be one of the valid DNS records.

## Example Usage

```typescript
import { RequestBodyType } from "@vercel/sdk/models/operations";

let value: RequestBodyType = "A";
```

## Values

```typescript
"A" | "AAAA" | "ALIAS" | "CAA" | "CNAME" | "HTTPS" | "MX" | "SRV" | "TXT" | "NS"
```