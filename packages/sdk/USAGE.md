<!-- Start SDK Example Usage [usage] -->
```typescript
import { Vercel } from "@vercel/sdk";

const vercel = new Vercel();

async function run() {
  await vercel.datacachePurgeall({
    projectIdOrName: "<value>",
  });
}

run();

```
<!-- End SDK Example Usage [usage] -->