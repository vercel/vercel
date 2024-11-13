<!-- Start SDK Example Usage [usage] -->
### List deployments

List deployments under the authenticated user or team.

```typescript
import { Vercel } from "@vercel/sdk";

const vercel = new Vercel({
  bearerToken: "<YOUR_BEARER_TOKEN_HERE>",
});

async function run() {
  const result = await vercel.deployments.getDeployments({
    app: "docs",
    from: 1612948664566,
    limit: 10,
    projectId: "QmXGTs7mvAMMC7WW5ebrM33qKG32QK3h4vmQMjmY",
    target: "production",
    to: 1612948664566,
    users: "kr1PsOIzqEL5Xg6M4VZcZosf,K4amb7K9dAt5R2vBJWF32bmY",
    since: 1540095775941,
    until: 1540095775951,
    state: "BUILDING,READY",
  });

  // Handle the result
  console.log(result);
}

run();

```

### Update an existing project

Update the fields of a project using either its name or id.

```typescript
import { Vercel } from "@vercel/sdk";

const vercel = new Vercel({
  bearerToken: "<YOUR_BEARER_TOKEN_HERE>",
});

async function run() {
  const result = await vercel.projects.updateProject({
    idOrName: "prj_12HKQaOmR5t5Uy6vdcQsNIiZgHGB",
    requestBody: {
      name: "a-project-name",
    },
  });

  // Handle the result
  console.log(result);
}

run();

```
<!-- End SDK Example Usage [usage] -->