# AddProjectDomainRequest

## Example Usage

```typescript
import { AddProjectDomainRequest } from '@vercel/client/models/operations';

let value: AddProjectDomainRequest = {
  idOrName: '<value>',
  requestBody: {
    name: 'www.example.com',
    gitBranch: null,
    redirect: 'foobar.com',
    redirectStatusCode: 307,
  },
};
```

## Fields

| Field         | Type                                                                                             | Required           | Description                                              |
| ------------- | ------------------------------------------------------------------------------------------------ | ------------------ | -------------------------------------------------------- |
| `idOrName`    | _string_                                                                                         | :heavy_check_mark: | The unique project identifier or the project name        |
| `teamId`      | _string_                                                                                         | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |
| `slug`        | _string_                                                                                         | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |
| `requestBody` | [operations.AddProjectDomainRequestBody](../../models/operations/addprojectdomainrequestbody.md) | :heavy_minus_sign: | N/A                                                      |
