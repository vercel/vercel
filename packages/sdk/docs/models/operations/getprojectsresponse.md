# GetProjectsResponse

## Example Usage

```typescript
import { GetProjectsResponse } from "@vercel/sdk/models/operations/getprojects.js";

let value: GetProjectsResponse = {
  result: {
    projects: [
      {
        accountId: "<id>",
        crons: {
          enabledAt: 360.34,
          disabledAt: 1747.72,
          updatedAt: 3891.35,
          deploymentId: "<id>",
          definitions: [
            {
              host: "vercel.com",
              path: "/api/crons/sync-something?hello=world",
              schedule: "0 0 * * *",
            },
          ],
        },
        directoryListing: false,
        id: "<id>",
        latestDeployments: [
          {
            createdAt: 9521.43,
            createdIn: "<value>",
            creator: {
              email: "Carole_King@gmail.com",
              uid: "<id>",
              username: "Ignacio.Predovic3",
            },
            deploymentHostname: "<value>",
            name: "<value>",
            id: "<id>",
            plan: "pro",
            private: false,
            readyState: "CANCELED",
            type: "LAMBDAS",
            url: "https://unrealistic-pilot.name",
            userId: "<id>",
            previewCommentsEnabled: false,
          },
        ],
        name: "<value>",
        nodeVersion: "16.x",
        targets: {
          "key": {
            createdAt: 9979.62,
            createdIn: "<value>",
            creator: {
              email: "Janie32@yahoo.com",
              uid: "<id>",
              username: "Angus.Kreiger",
            },
            deploymentHostname: "<value>",
            name: "<value>",
            id: "<id>",
            plan: "enterprise",
            private: false,
            readyState: "INITIALIZING",
            type: "LAMBDAS",
            url: "https://wilted-certification.com/",
            userId: "<id>",
            previewCommentsEnabled: false,
          },
        },
      },
    ],
    pagination: {
      count: 20,
      next: 1540095775951,
      prev: 1540095775951,
    },
  },
};
```

## Fields

| Field                                                                                    | Type                                                                                     | Required                                                                                 | Description                                                                              |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `result`                                                                                 | [operations.GetProjectsResponseBody](../../models/operations/getprojectsresponsebody.md) | :heavy_check_mark:                                                                       | N/A                                                                                      |