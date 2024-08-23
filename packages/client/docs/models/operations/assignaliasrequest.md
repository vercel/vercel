# AssignAliasRequest

## Example Usage

```typescript
import { AssignAliasRequest } from '@vercel/client/models/operations';

let value: AssignAliasRequest = {
  id: '<id>',
  requestBody: {
    alias: 'my-alias.vercel.app',
    redirect: null,
  },
};
```

## Fields

| Field         | Type                                                                                   | Required           | Description                                               |
| ------------- | -------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------- |
| `id`          | _string_                                                                               | :heavy_check_mark: | The ID of the deployment the aliases should be listed for |
| `teamId`      | _string_                                                                               | :heavy_minus_sign: | The Team identifier to perform the request on behalf of.  |
| `slug`        | _string_                                                                               | :heavy_minus_sign: | The Team slug to perform the request on behalf of.        |
| `requestBody` | [operations.AssignAliasRequestBody](../../models/operations/assignaliasrequestbody.md) | :heavy_minus_sign: | N/A                                                       |
