# GetProjectsResponseBody

The paginated list of projects

## Example Usage

```typescript
import { GetProjectsResponseBody } from "@vercel/sdk/models/operations/getprojects.js";

let value: GetProjectsResponseBody = {
  projects: [
    {
      accountId: "<id>",
      crons: {
        enabledAt: 894.95,
        disabledAt: 4059.42,
        updatedAt: 243.13,
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
          id: "<id>",
          createdAt: 3426.11,
          createdIn: "<value>",
          creator: {
            email: "Duncan69@yahoo.com",
            uid: "<id>",
            username: "Uriel58",
          },
          deploymentHostname: "<value>",
          name: "<value>",
          plan: "pro",
          previewCommentsEnabled: false,
          private: false,
          readyState: "READY",
          type: "LAMBDAS",
          url: "https://memorable-finger.net",
          userId: "<id>",
        },
      ],
      name: "<value>",
      nodeVersion: "22.x",
      targets: {
        "key": {
          id: "<id>",
          createdAt: 4420.36,
          createdIn: "<value>",
          creator: {
            email: "Mattie62@yahoo.com",
            uid: "<id>",
            username: "Libby50",
          },
          deploymentHostname: "<value>",
          name: "<value>",
          plan: "enterprise",
          previewCommentsEnabled: false,
          private: false,
          readyState: "CANCELED",
          type: "LAMBDAS",
          url: "https://wiggly-tooth.com",
          userId: "<id>",
        },
      },
    },
  ],
  pagination: {
    count: 20,
    next: 1540095775951,
    prev: 1540095775951,
  },
};
```

## Fields

| Field                                                                                                                                                           | Type                                                                                                                                                            | Required                                                                                                                                                        | Description                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projects`                                                                                                                                                      | [operations.GetProjectsProjects](../../models/operations/getprojectsprojects.md)[]                                                                              | :heavy_check_mark:                                                                                                                                              | N/A                                                                                                                                                             |
| `pagination`                                                                                                                                                    | [components.Pagination](../../models/components/pagination.md)                                                                                                  | :heavy_check_mark:                                                                                                                                              | This object contains information related to the pagination of the current request, including the necessary parameters to get the next or previous page of data. |