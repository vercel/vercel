# CreateLogDrainResponseBody

The log drain was successfully created

## Example Usage

```typescript
import { CreateLogDrainResponseBody } from "@vercel/sdk/models/operations";

let value: CreateLogDrainResponseBody = {
  clientId: "oac_xRhY4LAB7yLhUADD69EvV7ct",
  configurationId: "icfg_cuwj0AdCdH3BwWT4LPijCC7t",
  createdAt: 1558531915505,
  id: "ld_nBuA7zCID8g4QZ8g",
  deliveryFormat: "json",
  name: "My first log drain",
  ownerId: "kr1PsOIzqEL5Xg6M4VZcZosf",
  projectId: "AbCgVkqoxXeXCDWehVir51LHGrrcWL4mkYm14W6UBPWQeb",
  projectIds: [
    "AbCgVkqoxXeXCDWehVir51LHGrrcWL4mkYm14W6UBPWQeb",
  ],
  url: "https://example.com/log-drain",
  sources: [
    "build",
    "edge",
  ],
  createdFrom: "integration",
  headers: {
    "0": "{",
    "1": "\"",
    "2": "A",
    "3": "u",
    "4": "t",
    "5": "h",
    "6": "o",
    "7": "r",
    "8": "i",
    "9": "z",
    "10": "a",
    "11": "t",
    "12": "i",
    "13": "o",
    "14": "n",
    "15": "\"",
    "16": ":",
    "17": " ",
    "18": "\"",
    "19": "B",
    "20": "e",
    "21": "a",
    "22": "r",
    "23": "e",
    "24": "r",
    "25": " ",
    "26": "1",
    "27": "2",
    "28": "3",
    "29": "\"",
    "30": "}",
  },
  environments: [
    "production",
  ],
  branch: "feature/*",
  samplingRate: 0.5,
};
```

## Fields

| Field                                                                                              | Type                                                                                               | Required                                                                                           | Description                                                                                        | Example                                                                                            |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `clientId`                                                                                         | *string*                                                                                           | :heavy_minus_sign:                                                                                 | The oauth2 client application id that created this log drain                                       | oac_xRhY4LAB7yLhUADD69EvV7ct                                                                       |
| `configurationId`                                                                                  | *string*                                                                                           | :heavy_minus_sign:                                                                                 | The client configuration this log drain was created with                                           | icfg_cuwj0AdCdH3BwWT4LPijCC7t                                                                      |
| `createdAt`                                                                                        | *number*                                                                                           | :heavy_check_mark:                                                                                 | A timestamp that tells you when the log drain was created                                          | 1558531915505                                                                                      |
| `id`                                                                                               | *string*                                                                                           | :heavy_check_mark:                                                                                 | The unique identifier of the log drain. Always prefixed with `ld_`                                 | ld_nBuA7zCID8g4QZ8g                                                                                |
| `deliveryFormat`                                                                                   | [operations.CreateLogDrainDeliveryFormat](../../models/operations/createlogdraindeliveryformat.md) | :heavy_minus_sign:                                                                                 | The delivery log format                                                                            | json                                                                                               |
| `name`                                                                                             | *string*                                                                                           | :heavy_check_mark:                                                                                 | The name of the log drain                                                                          | My first log drain                                                                                 |
| `ownerId`                                                                                          | *string*                                                                                           | :heavy_check_mark:                                                                                 | The identifier of the team or user whose events will trigger the log drain                         | kr1PsOIzqEL5Xg6M4VZcZosf                                                                           |
| `projectId`                                                                                        | *string*                                                                                           | :heavy_minus_sign:                                                                                 | N/A                                                                                                | AbCgVkqoxXeXCDWehVir51LHGrrcWL4mkYm14W6UBPWQeb                                                     |
| `projectIds`                                                                                       | *string*[]                                                                                         | :heavy_minus_sign:                                                                                 | The identifier of the projects this log drain is associated with                                   | AbCgVkqoxXeXCDWehVir51LHGrrcWL4mkYm14W6UBPWQeb                                                     |
| `url`                                                                                              | *string*                                                                                           | :heavy_check_mark:                                                                                 | The URL to call when logs are generated                                                            | https://example.com/log-drain                                                                      |
| `sources`                                                                                          | [operations.CreateLogDrainSources](../../models/operations/createlogdrainsources.md)[]             | :heavy_minus_sign:                                                                                 | The sources from which logs are currently being delivered to this log drain.                       | [<br/>"build",<br/>"edge"<br/>]                                                                    |
| `createdFrom`                                                                                      | [operations.CreateLogDrainCreatedFrom](../../models/operations/createlogdraincreatedfrom.md)       | :heavy_minus_sign:                                                                                 | Whether the log drain was created by an integration or by a user                                   | integration                                                                                        |
| `headers`                                                                                          | Record<string, *string*>                                                                           | :heavy_minus_sign:                                                                                 | The headers to send with the request                                                               | {"Authorization": "Bearer 123"}                                                                    |
| `environments`                                                                                     | [operations.CreateLogDrainEnvironments](../../models/operations/createlogdrainenvironments.md)[]   | :heavy_check_mark:                                                                                 | The environment of log drain                                                                       | [<br/>"production"<br/>]                                                                           |
| `branch`                                                                                           | *string*                                                                                           | :heavy_minus_sign:                                                                                 | The branch regexp of log drain                                                                     | feature/*                                                                                          |
| `samplingRate`                                                                                     | *number*                                                                                           | :heavy_minus_sign:                                                                                 | The sampling rate of log drain                                                                     | 0.5                                                                                                |