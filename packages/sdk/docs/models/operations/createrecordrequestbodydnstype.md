# CreateRecordRequestBodyDnsType

The type of record, it could be one of the valid DNS records.

## Example Usage

```typescript
import { CreateRecordRequestBodyDnsType } from "@vercel/sdk/models/operations";

let value: CreateRecordRequestBodyDnsType = "CNAME";
```

## Values

```typescript
"A" | "AAAA" | "ALIAS" | "CAA" | "CNAME" | "HTTPS" | "MX" | "SRV" | "TXT" | "NS"
```