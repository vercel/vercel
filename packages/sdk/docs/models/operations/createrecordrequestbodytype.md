# CreateRecordRequestBodyType

The type of record, it could be one of the valid DNS records.

## Example Usage

```typescript
import { CreateRecordRequestBodyType } from "@vercel/sdk/models/operations";

let value: CreateRecordRequestBodyType = "MX";
```

## Values

```typescript
"A" | "AAAA" | "ALIAS" | "CAA" | "CNAME" | "HTTPS" | "MX" | "SRV" | "TXT" | "NS"
```