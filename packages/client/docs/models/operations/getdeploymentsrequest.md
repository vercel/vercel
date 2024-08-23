# GetDeploymentsRequest

## Example Usage

```typescript
import { GetDeploymentsRequest } from '@vercel/client/models/operations';

let value: GetDeploymentsRequest = {
  app: 'docs',
  from: 1612948664566,
  limit: 10,
  projectId: 'QmXGTs7mvAMMC7WW5ebrM33qKG32QK3h4vmQMjmY',
  target: 'production',
  to: 1612948664566,
  users: 'kr1PsOIzqEL5Xg6M4VZcZosf,K4amb7K9dAt5R2vBJWF32bmY',
  since: 1540095775941,
  until: 1540095775951,
  state: 'BUILDING,READY',
};
```

## Fields

| Field               | Type      | Required           | Description                                                                                                  | Example                                           |
| ------------------- | --------- | ------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `app`               | _string_  | :heavy_minus_sign: | Name of the deployment.                                                                                      | docs                                              |
| `from`              | _number_  | :heavy_minus_sign: | Gets the deployment created after this Date timestamp. (default: current time)                               | 1612948664566                                     |
| `limit`             | _number_  | :heavy_minus_sign: | Maximum number of deployments to list from a request.                                                        | 10                                                |
| `projectId`         | _string_  | :heavy_minus_sign: | Filter deployments from the given ID or name.                                                                | QmXGTs7mvAMMC7WW5ebrM33qKG32QK3h4vmQMjmY          |
| `target`            | _string_  | :heavy_minus_sign: | Filter deployments based on the environment.                                                                 | production                                        |
| `to`                | _number_  | :heavy_minus_sign: | Gets the deployment created before this Date timestamp. (default: current time)                              | 1612948664566                                     |
| `users`             | _string_  | :heavy_minus_sign: | Filter out deployments based on users who have created the deployment.                                       | kr1PsOIzqEL5Xg6M4VZcZosf,K4amb7K9dAt5R2vBJWF32bmY |
| `since`             | _number_  | :heavy_minus_sign: | Get Deployments created after this JavaScript timestamp.                                                     | 1540095775941                                     |
| `until`             | _number_  | :heavy_minus_sign: | Get Deployments created before this JavaScript timestamp.                                                    | 1540095775951                                     |
| `state`             | _string_  | :heavy_minus_sign: | Filter deployments based on their state (`BUILDING`, `ERROR`, `INITIALIZING`, `QUEUED`, `READY`, `CANCELED`) | BUILDING,READY                                    |
| `rollbackCandidate` | _boolean_ | :heavy_minus_sign: | Filter deployments based on their rollback candidacy                                                         |                                                   |
| `teamId`            | _string_  | :heavy_minus_sign: | The Team identifier to perform the request on behalf of.                                                     |                                                   |
| `slug`              | _string_  | :heavy_minus_sign: | The Team slug to perform the request on behalf of.                                                           |                                                   |
