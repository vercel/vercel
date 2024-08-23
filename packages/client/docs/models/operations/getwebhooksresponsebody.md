# GetWebhooksResponseBody

## Example Usage

```typescript
import { GetWebhooksResponseBody } from '@vercel/client/models/operations';

let value: GetWebhooksResponseBody = {
  projectsMetadata: [
    {
      id: '<id>',
      name: '<value>',
    },
  ],
  events: ['deployment.created'],
  id: 'account_hook_GflD6EYyo7F4ViYS',
  url: 'https://my-webhook.com',
  ownerId: 'ZspSRT4ljIEEmMHgoDwKWDei',
  createdAt: 1567024758130,
  updatedAt: 1567024758130,
  projectIds: ['prj_12HKQaOmR5t5Uy6vdcQsNIiZgHGB'],
};
```

## Fields

| Field              | Type                                                                             | Required           | Description                                                                  | Example                                        |
| ------------------ | -------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------- |
| `projectsMetadata` | [operations.ProjectsMetadata](../../models/operations/projectsmetadata.md)[]     | :heavy_check_mark: | N/A                                                                          |                                                |
| `events`           | [operations.ResponseBodyEvents](../../models/operations/responsebodyevents.md)[] | :heavy_check_mark: | The webhooks events                                                          | deployment.created                             |
| `id`               | _string_                                                                         | :heavy_check_mark: | The webhook id                                                               | account_hook_GflD6EYyo7F4ViYS                  |
| `url`              | _string_                                                                         | :heavy_check_mark: | A string with the URL of the webhook                                         | https://my-webhook.com                         |
| `ownerId`          | _string_                                                                         | :heavy_check_mark: | The unique ID of the team the webhook belongs to                             | ZspSRT4ljIEEmMHgoDwKWDei                       |
| `createdAt`        | _number_                                                                         | :heavy_check_mark: | A number containing the date when the webhook was created in in milliseconds | 1567024758130                                  |
| `updatedAt`        | _number_                                                                         | :heavy_check_mark: | A number containing the date when the webhook was updated in in milliseconds | 1567024758130                                  |
| `projectIds`       | _string_[]                                                                       | :heavy_minus_sign: | The ID of the projects the webhook is associated with                        | [<br/>"prj_12HKQaOmR5t5Uy6vdcQsNIiZgHGB"<br/>] |
