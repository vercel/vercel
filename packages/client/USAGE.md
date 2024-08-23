<!-- Start SDK Example Usage [usage] -->

```typescript
import { Vercel } from '@vercel/client';

const vercel = new Vercel();

async function run() {
  const result = await vercel.listDeploymentBuilds({
    deploymentId: '<value>',
  });

  // Handle the result
  console.log(result);
}

run();
```

<!-- End SDK Example Usage [usage] -->
