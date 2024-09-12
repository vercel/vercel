# ConfiguredBy

How we see the domain's configuration. - `CNAME`: Domain has a CNAME pointing to Vercel. - `A`: Domain's A record is resolving to Vercel. - `http`: Domain is resolving to Vercel but may be behind a Proxy. - `dns-01`: Domain is not resolving to Vercel but dns-01 challenge is enabled. - `null`: Domain is not resolving to Vercel.

## Example Usage

```typescript
import { ConfiguredBy } from "@vercel/sdk/models/operations";

let value: ConfiguredBy = "A";
```

## Values

```typescript
"CNAME" | "A" | "http" | "dns-01"
```