# GetDeploymentsResponseBody

## Example Usage

```typescript
import { GetDeploymentsResponseBody } from "@vercel/sdk/models/operations";

let value: GetDeploymentsResponseBody = {
  pagination: {
    count: 20,
    next: 1540095775951,
    prev: 1540095775951,
  },
  deployments: [
    {
      uid: "dpl_2euZBFqxYdDMDG1jTrHFnNZ2eUVa",
      name: "docs",
      url: "docs-9jaeg38me.vercel.app",
      created: 1609492210000,
      deleted: 1609492210000,
      undeleted: 1609492210000,
      softDeletedByRetention: true,
      source: "cli",
      state: "READY",
      readyState: "READY",
      type: "LAMBDAS",
      creator: {
        uid: "eLrCnEgbKhsHyfbiNR7E8496",
        email: "example@example.com",
        username: "johndoe",
        githubLogin: "johndoe",
        gitlabLogin: "johndoe",
      },
      target: "production",
      createdAt: 1609492210000,
      buildingAt: 1609492210000,
      ready: 1609492210000,
      inspectorUrl:
        "https://vercel.com/acme/nextjs/J1hXN00qjUeoYfpEEf7dnDtpSiVq",
    },
  ],
};
```

## Fields

| Field                                                                                                                                                           | Type                                                                                                                                                            | Required                                                                                                                                                        | Description                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pagination`                                                                                                                                                    | [components.Pagination](../../models/components/pagination.md)                                                                                                  | :heavy_check_mark:                                                                                                                                              | This object contains information related to the pagination of the current request, including the necessary parameters to get the next or previous page of data. |
| `deployments`                                                                                                                                                   | [operations.Deployments](../../models/operations/deployments.md)[]                                                                                              | :heavy_check_mark:                                                                                                                                              | N/A                                                                                                                                                             |