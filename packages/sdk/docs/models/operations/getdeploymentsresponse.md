# GetDeploymentsResponse

## Example Usage

```typescript
import { GetDeploymentsResponse } from "@vercel/sdk/models/operations";

let value: GetDeploymentsResponse = {
  result: {
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
  },
};
```

## Fields

| Field                                                                                          | Type                                                                                           | Required                                                                                       | Description                                                                                    |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `result`                                                                                       | [operations.GetDeploymentsResponseBody](../../models/operations/getdeploymentsresponsebody.md) | :heavy_check_mark:                                                                             | N/A                                                                                            |