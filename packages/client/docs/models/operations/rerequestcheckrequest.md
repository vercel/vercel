# RerequestCheckRequest

## Example Usage

```typescript
import { RerequestCheckRequest } from '@vercel/client/models/operations';

let value: RerequestCheckRequest = {
  deploymentId: 'dpl_2qn7PZrx89yxY34vEZPD31Y9XVj6',
  checkId: 'check_2qn7PZrx89yxY34vEZPD31Y9XVj6',
};
```

## Fields

| Field          | Type     | Required           | Description                                              | Example                            |
| -------------- | -------- | ------------------ | -------------------------------------------------------- | ---------------------------------- |
| `deploymentId` | _string_ | :heavy_check_mark: | The deployment to rerun the check for.                   | dpl_2qn7PZrx89yxY34vEZPD31Y9XVj6   |
| `checkId`      | _string_ | :heavy_check_mark: | The check to rerun                                       | check_2qn7PZrx89yxY34vEZPD31Y9XVj6 |
| `teamId`       | _string_ | :heavy_minus_sign: | The Team identifier to perform the request on behalf of. |                                    |
| `slug`         | _string_ | :heavy_minus_sign: | The Team slug to perform the request on behalf of.       |                                    |
