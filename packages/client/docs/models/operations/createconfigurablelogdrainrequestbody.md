# CreateConfigurableLogDrainRequestBody

## Example Usage

```typescript
import { CreateConfigurableLogDrainRequestBody } from '@vercel/client/models/operations';

let value: CreateConfigurableLogDrainRequestBody = {
  deliveryFormat: 'json',
  url: 'http://scary-sweater.com',
  sources: ['build'],
};
```

## Fields

| Field            | Type                                                                                                                       | Required           | Description                                                                                                       | Example |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------- | ------- |
| `deliveryFormat` | [operations.CreateConfigurableLogDrainDeliveryFormat](../../models/operations/createconfigurablelogdraindeliveryformat.md) | :heavy_check_mark: | The delivery log format                                                                                           | json    |
| `url`            | _string_                                                                                                                   | :heavy_check_mark: | The log drain url                                                                                                 |         |
| `headers`        | Record<string, _string_>                                                                                                   | :heavy_minus_sign: | Headers to be sent together with the request                                                                      |         |
| `projectIds`     | _string_[]                                                                                                                 | :heavy_minus_sign: | N/A                                                                                                               |         |
| `sources`        | [operations.CreateConfigurableLogDrainSources](../../models/operations/createconfigurablelogdrainsources.md)[]             | :heavy_check_mark: | N/A                                                                                                               |         |
| `environments`   | [operations.CreateConfigurableLogDrainEnvironments](../../models/operations/createconfigurablelogdrainenvironments.md)[]   | :heavy_minus_sign: | N/A                                                                                                               |         |
| `secret`         | _string_                                                                                                                   | :heavy_minus_sign: | Custom secret of log drain                                                                                        |         |
| `samplingRate`   | _number_                                                                                                                   | :heavy_minus_sign: | The sampling rate for this log drain. It should be a percentage rate between 0 and 100. With max 2 decimal points |         |
| `name`           | _string_                                                                                                                   | :heavy_minus_sign: | The custom name of this log drain.                                                                                |         |
