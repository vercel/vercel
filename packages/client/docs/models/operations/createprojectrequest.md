# CreateProjectRequest

## Example Usage

```typescript
import { CreateProjectRequest } from '@vercel/client/models/operations';

let value: CreateProjectRequest = {
  requestBody: {
    name: 'a-project-name',
  },
};
```

## Fields

| Field         | Type                                                                                       | Required           | Description                                              |
| ------------- | ------------------------------------------------------------------------------------------ | ------------------ | -------------------------------------------------------- |
| `teamId`      | _string_                                                                                   | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |
| `slug`        | _string_                                                                                   | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |
| `requestBody` | [operations.CreateProjectRequestBody](../../models/operations/createprojectrequestbody.md) | :heavy_minus_sign: | N/A                                                      |
