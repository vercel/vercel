# Aliases

## Example Usage

```typescript
import { Aliases } from "@vercel/sdk/models/operations";

let value: Aliases = {
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
};
```

## Fields

| Field                                                                                         | Type                                                                                          | Required                                                                                      | Description                                                                                   | Example                                                                                       |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `alias`                                                                                       | *string*                                                                                      | :heavy_check_mark:                                                                            | The alias name, it could be a `.vercel.app` subdomain or a custom domain                      | my-alias.vercel.app                                                                           |
| `created`                                                                                     | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark:                                                                            | The date when the alias was created                                                           | 2017-04-26T23:00:34.232Z                                                                      |
| `createdAt`                                                                                   | *number*                                                                                      | :heavy_minus_sign:                                                                            | The date when the alias was created in milliseconds since the UNIX epoch                      | 1540095775941                                                                                 |
| `creator`                                                                                     | [operations.ListAliasesCreator](../../models/operations/listaliasescreator.md)                | :heavy_minus_sign:                                                                            | Information of the user who created the alias                                                 |                                                                                               |
| `deletedAt`                                                                                   | *number*                                                                                      | :heavy_minus_sign:                                                                            | The date when the alias was deleted in milliseconds since the UNIX epoch                      | 1540095775941                                                                                 |
| `deployment`                                                                                  | [operations.ListAliasesDeployment](../../models/operations/listaliasesdeployment.md)          | :heavy_minus_sign:                                                                            | A map with the deployment ID, URL and metadata                                                |                                                                                               |
| `deploymentId`                                                                                | *string*                                                                                      | :heavy_check_mark:                                                                            | The deployment ID                                                                             | dpl_5m8CQaRBm3FnWRW1od3wKTpaECPx                                                              |
| `projectId`                                                                                   | *string*                                                                                      | :heavy_check_mark:                                                                            | The unique identifier of the project                                                          | prj_12HKQaOmR5t5Uy6vdcQsNIiZgHGB                                                              |
| `redirect`                                                                                    | *string*                                                                                      | :heavy_minus_sign:                                                                            | Target destination domain for redirect when the alias is a redirect                           |                                                                                               |
| `redirectStatusCode`                                                                          | *number*                                                                                      | :heavy_minus_sign:                                                                            | Status code to be used on redirect                                                            |                                                                                               |
| `uid`                                                                                         | *string*                                                                                      | :heavy_check_mark:                                                                            | The unique identifier of the alias                                                            |                                                                                               |
| `updatedAt`                                                                                   | *number*                                                                                      | :heavy_minus_sign:                                                                            | The date when the alias was updated in milliseconds since the UNIX epoch                      | 1540095775941                                                                                 |
| `protectionBypass`                                                                            | Record<string, *operations.ListAliasesProtectionBypass*>                                      | :heavy_minus_sign:                                                                            | The protection bypass for the alias                                                           |                                                                                               |