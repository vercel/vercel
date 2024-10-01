# CreateRecordRequestBodyDnsType

The type of record, it could be one of the valid DNS records.

## Example Usage

```typescript
import { CreateRecordRequestBodyDnsType } from "@vercel/sdk/models/operations/createrecord.js";

let value: CreateRecordRequestBodyDnsType = "NS";
```

## Values

```typescript
"A" | "AAAA" | "ALIAS" | "CAA" | "CNAME" | "HTTPS" | "MX" | "SRV" | "TXT" | "NS"
```