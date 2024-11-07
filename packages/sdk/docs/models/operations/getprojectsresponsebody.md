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
        enabledAt: 6222.31,
        disabledAt: 2790.68,
        updatedAt: 2097.50,
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
          createdAt: 1157.03,
          createdIn: "<value>",
          creator: {
            email: "Maureen.White@yahoo.com",
            uid: "<id>",
            username: "Laila_Armstrong-Predovic",
          },
          deploymentHostname: "<value>",
          name: "<value>",
          plan: "hobby",
          previewCommentsEnabled: false,
          private: false,
          readyState: "BUILDING",
          type: "LAMBDAS",
          url: "https://miserable-popularity.com/",
          userId: "<id>",
        },
      ],
      name: "<value>",
      nodeVersion: "20.x",
      targets: {
        "key": {
          id: "<id>",
          createdAt: 4103.02,
          createdIn: "<value>",
          creator: {
            email: "Sherman_Collier@yahoo.com",
            uid: "<id>",
            username: "Theodore96",
          },
          deploymentHostname: "<value>",
          name: "<value>",
          plan: "pro",
          previewCommentsEnabled: false,
          private: false,
          readyState: "ERROR",
          type: "LAMBDAS",
          url: "https://well-groomed-eternity.com/",
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