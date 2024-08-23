# AddProjectDomainVerification

A list of verification challenges, one of which must be completed to verify the domain for use on the project. After the challenge is complete `POST /projects/:idOrName/domains/:domain/verify` to verify the domain. Possible challenges: - If `verification.type = TXT` the `verification.domain` will be checked for a TXT record matching `verification.value`.

## Example Usage

```typescript
import { AddProjectDomainVerification } from '@vercel/client/models/operations';

let value: AddProjectDomainVerification = {
  type: '<value>',
  domain: 'hefty-cougar.com',
  value: '<value>',
  reason: '<value>',
};
```

## Fields

| Field    | Type     | Required           | Description |
| -------- | -------- | ------------------ | ----------- |
| `type`   | _string_ | :heavy_check_mark: | N/A         |
| `domain` | _string_ | :heavy_check_mark: | N/A         |
| `value`  | _string_ | :heavy_check_mark: | N/A         |
| `reason` | _string_ | :heavy_check_mark: | N/A         |
