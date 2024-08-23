# Connection

Information for the SAML Single Sign-On configuration.

## Example Usage

```typescript
import { Connection } from '@vercel/client/models/components';

let value: Connection = {
  type: 'OktaSAML',
  status: 'linked',
  state: 'active',
  connectedAt: 1611796915677,
  lastReceivedWebhookEvent: 1611796915677,
};
```

## Fields

| Field                      | Type     | Required           | Description                                                                          | Example       |
| -------------------------- | -------- | ------------------ | ------------------------------------------------------------------------------------ | ------------- |
| `type`                     | _string_ | :heavy_check_mark: | The Identity Provider "type", for example Okta.                                      | OktaSAML      |
| `status`                   | _string_ | :heavy_check_mark: | Current status of the connection.                                                    | linked        |
| `state`                    | _string_ | :heavy_check_mark: | Current state of the connection.                                                     | active        |
| `connectedAt`              | _number_ | :heavy_check_mark: | Timestamp (in milliseconds) of when the configuration was connected.                 | 1611796915677 |
| `lastReceivedWebhookEvent` | _number_ | :heavy_minus_sign: | Timestamp (in milliseconds) of when the last webhook event was received from WorkOS. | 1611796915677 |
