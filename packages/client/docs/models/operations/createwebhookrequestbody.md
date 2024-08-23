# CreateWebhookRequestBody

## Example Usage

```typescript
import { CreateWebhookRequestBody } from '@vercel/client/models/operations';

let value: CreateWebhookRequestBody = {
  url: 'http://distinct-jewelry.name',
  events: ['integration-configuration.permission-upgraded'],
};
```

## Fields

| Field        | Type                                                     | Required           | Description |
| ------------ | -------------------------------------------------------- | ------------------ | ----------- |
| `url`        | _string_                                                 | :heavy_check_mark: | N/A         |
| `events`     | [operations.Events](../../models/operations/events.md)[] | :heavy_check_mark: | N/A         |
| `projectIds` | _string_[]                                               | :heavy_minus_sign: | N/A         |
