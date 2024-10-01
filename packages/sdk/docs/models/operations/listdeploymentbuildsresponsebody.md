# ListDeploymentBuildsResponseBody

## Example Usage

```typescript
import { ListDeploymentBuildsResponseBody } from "@vercel/sdk/models/operations/listdeploymentbuilds.js";

let value: ListDeploymentBuildsResponseBody = {
  builds: [
    {
      id: "<id>",
      deploymentId: "<id>",
      entrypoint: "<value>",
      readyState: "CANCELED",
      output: [
        {
          path: "/var/spool",
          digest: "<value>",
          mode: 3834.42,
        },
      ],
    },
  ],
};
```

## Fields

| Field                                                    | Type                                                     | Required                                                 | Description                                              |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| `builds`                                                 | [operations.Builds](../../models/operations/builds.md)[] | :heavy_check_mark:                                       | N/A                                                      |