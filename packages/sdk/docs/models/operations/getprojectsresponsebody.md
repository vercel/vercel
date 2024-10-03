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
        enabledAt: 9221.11,
        disabledAt: 894.95,
        updatedAt: 4059.42,
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
          createdAt: 243.13,
          createdIn: "<value>",
          creator: {
            email: "Lily57@yahoo.com",
            uid: "<id>",
            username: "Margarett_Abernathy",
          },
          deploymentHostname: "<value>",
          name: "<value>",
          id: "<id>",
          plan: "hobby",
          private: false,
          readyState: "BUILDING",
          type: "LAMBDAS",
          url: "https://stylish-language.info",
          userId: "<id>",
          previewCommentsEnabled: false,
        },
      ],
      name: "<value>",
      nodeVersion: "10.x",
      targets: {
        "key": {
          createdAt: 972.43,
          createdIn: "<value>",
          creator: {
            email: "Josie.Borer@yahoo.com",
            uid: "<id>",
            username: "Sherman_Collier",
          },
          deploymentHostname: "<value>",
          name: "<value>",
          id: "<id>",
          plan: "hobby",
          private: false,
          readyState: "QUEUED",
          type: "LAMBDAS",
          url: "https://svelte-video.org",
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
};
```

## Fields

| Field                                                                                                                                                           | Type                                                                                                                                                            | Required                                                                                                                                                        | Description                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projects`                                                                                                                                                      | [operations.GetProjectsProjects](../../models/operations/getprojectsprojects.md)[]                                                                              | :heavy_check_mark:                                                                                                                                              | N/A                                                                                                                                                             |
| `pagination`                                                                                                                                                    | [components.Pagination](../../models/components/pagination.md)                                                                                                  | :heavy_check_mark:                                                                                                                                              | This object contains information related to the pagination of the current request, including the necessary parameters to get the next or previous page of data. |