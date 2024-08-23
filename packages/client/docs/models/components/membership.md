# Membership

The membership of the authenticated User in relation to the Team.

## Example Usage

```typescript
import { Membership } from '@vercel/client/models/components';

let value: Membership = {};
```

## Fields

| Field               | Type                                                           | Required           | Description |
| ------------------- | -------------------------------------------------------------- | ------------------ | ----------- |
| `confirmed`         | _boolean_                                                      | :heavy_minus_sign: | N/A         |
| `confirmedAt`       | _number_                                                       | :heavy_minus_sign: | N/A         |
| `accessRequestedAt` | _number_                                                       | :heavy_minus_sign: | N/A         |
| `role`              | [components.Role](../../models/components/role.md)             | :heavy_minus_sign: | N/A         |
| `teamId`            | _string_                                                       | :heavy_minus_sign: | N/A         |
| `createdAt`         | _number_                                                       | :heavy_minus_sign: | N/A         |
| `created`           | _number_                                                       | :heavy_minus_sign: | N/A         |
| `joinedFrom`        | [components.JoinedFrom](../../models/components/joinedfrom.md) | :heavy_minus_sign: | N/A         |
| `uid`               | _string_                                                       | :heavy_minus_sign: | N/A         |
