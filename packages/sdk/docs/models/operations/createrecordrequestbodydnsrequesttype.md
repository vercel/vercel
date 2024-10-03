# CreateRecordRequestBodyDnsRequestType

The type of record, it could be one of the valid DNS records.

## Example Usage

```typescript
import { CreateRecordRequestBodyDnsRequestType } from "@vercel/sdk/models/operations/createrecord.js";

let value: CreateRecordRequestBodyDnsRequestType = "HTTPS";
```

## Values

```typescript
"A" | "AAAA" | "ALIAS" | "CAA" | "CNAME" | "HTTPS" | "MX" | "SRV" | "TXT" | "NS"
```