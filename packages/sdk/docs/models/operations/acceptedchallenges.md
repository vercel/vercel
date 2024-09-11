# AcceptedChallenges

Which challenge types the domain can use for issuing certs.

## Example Usage

```typescript
import { AcceptedChallenges } from "@vercel/sdk/models/operations/getdomainconfig.js";

let value: AcceptedChallenges = "dns-01";
```

## Values

```typescript
"dns-01" | "http-01"
```