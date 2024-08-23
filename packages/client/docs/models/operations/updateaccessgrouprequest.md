# UpdateAccessGroupRequest

## Example Usage

```typescript
import { UpdateAccessGroupRequest } from '@vercel/client/models/operations';

let value: UpdateAccessGroupRequest = {
  idOrName: '<value>',
  requestBody: {
    name: 'My access group',
    projects: [
      {
        projectId: 'prj_ndlgr43fadlPyCtREAqxxdyFK',
        role: 'ADMIN',
      },
    ],
  },
};
```

## Fields

| Field         | Type                                                                                               | Required           | Description                                              |
| ------------- | -------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------- |
| `idOrName`    | _string_                                                                                           | :heavy_check_mark: | N/A                                                      |
| `teamId`      | _string_                                                                                           | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |
| `slug`        | _string_                                                                                           | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |
| `requestBody` | [operations.UpdateAccessGroupRequestBody](../../models/operations/updateaccessgrouprequestbody.md) | :heavy_minus_sign: | N/A                                                      |
