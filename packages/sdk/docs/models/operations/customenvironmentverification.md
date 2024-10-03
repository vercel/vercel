# CustomEnvironmentVerification

A list of verification challenges, one of which must be completed to verify the domain for use on the project. After the challenge is complete `POST /projects/:idOrName/domains/:domain/verify` to verify the domain. Possible challenges: - If `verification.type = TXT` the `verification.domain` will be checked for a TXT record matching `verification.value`.

## Example Usage

```typescript
import { CustomEnvironmentVerification } from "@vercel/sdk/models/operations/canceldeployment.js";

let value: CustomEnvironmentVerification = {
  type: "<value>",
  domain: "authorized-brief.com",
  value: "<value>",
  reason: "<value>",
};
```

## Fields

| Field              | Type               | Required           | Description        |
| ------------------ | ------------------ | ------------------ | ------------------ |
| `type`             | *string*           | :heavy_check_mark: | N/A                |
| `domain`           | *string*           | :heavy_check_mark: | N/A                |
| `value`            | *string*           | :heavy_check_mark: | N/A                |
| `reason`           | *string*           | :heavy_check_mark: | N/A                |