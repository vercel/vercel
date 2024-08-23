# AddProjectMemberRequest

## Example Usage

```typescript
import { AddProjectMemberRequest } from '@vercel/client/models/operations';

let value: AddProjectMemberRequest = {
  idOrName: 'prj_pavWOn1iLObbXLRiwVvzmPrTWyTf',
  requestBody: {
    uid: 'ndlgr43fadlPyCtREAqxxdyFK',
    username: 'example',
    email: 'entity@example.com',
    role: 'ADMIN',
  },
};
```

## Fields

| Field         | Type                                     | Required           | Description                                              | Example                          |
| ------------- | ---------------------------------------- | ------------------ | -------------------------------------------------------- | -------------------------------- |
| `idOrName`    | _string_                                 | :heavy_check_mark: | The ID or name of the Project.                           | prj_pavWOn1iLObbXLRiwVvzmPrTWyTf |
| `teamId`      | _string_                                 | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |                                  |
| `slug`        | _string_                                 | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |                                  |
| `requestBody` | _operations.AddProjectMemberRequestBody_ | :heavy_minus_sign: | N/A                                                      |                                  |
