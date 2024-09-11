# ListAliasesResponse

## Example Usage

```typescript
import { ListAliasesResponse } from "@vercel/sdk/models/operations";

let value: ListAliasesResponse = {
  result: {
    aliases: [
      {
        alias: "my-alias.vercel.app",
        created: new Date("2017-04-26T23:00:34.232Z"),
        createdAt: 1540095775941,
        creator: {
          uid: "96SnxkFiMyVKsK3pnoHfx3Hz",
          email: "john-doe@gmail.com",
          username: "john-doe",
        },
        deletedAt: 1540095775941,
        deployment: {
          id: "dpl_5m8CQaRBm3FnWRW1od3wKTpaECPx",
          url: "my-instant-deployment-3ij3cxz9qr.now.sh",
          meta: "{}",
        },
        deploymentId: "dpl_5m8CQaRBm3FnWRW1od3wKTpaECPx",
        projectId: "prj_12HKQaOmR5t5Uy6vdcQsNIiZgHGB",
        uid: "<value>",
        updatedAt: 1540095775941,
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
| `result`                                                                                 | [operations.ListAliasesResponseBody](../../models/operations/listaliasesresponsebody.md) | :heavy_check_mark:                                                                       | N/A                                                                                      |