# Members

## Example Usage

```typescript
import { Members } from '@vercel/client/models/operations';

let value: Members = {
  email: 'Hunter.Gulgowski96@yahoo.com',
  uid: '<value>',
  username: 'Donny_Hoppe',
  teamRole: 'VIEWER',
};
```

## Fields

| Field       | Type                                                       | Required           | Description |
| ----------- | ---------------------------------------------------------- | ------------------ | ----------- |
| `avatar`    | _string_                                                   | :heavy_minus_sign: | N/A         |
| `email`     | _string_                                                   | :heavy_check_mark: | N/A         |
| `uid`       | _string_                                                   | :heavy_check_mark: | N/A         |
| `username`  | _string_                                                   | :heavy_check_mark: | N/A         |
| `name`      | _string_                                                   | :heavy_minus_sign: | N/A         |
| `createdAt` | _string_                                                   | :heavy_minus_sign: | N/A         |
| `teamRole`  | [operations.TeamRole](../../models/operations/teamrole.md) | :heavy_check_mark: | N/A         |
