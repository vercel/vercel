# ListAliasesDeployment

A map with the deployment ID, URL and metadata

## Example Usage

```typescript
import { ListAliasesDeployment } from '@vercel/client/models/operations';

let value: ListAliasesDeployment = {
  id: 'dpl_5m8CQaRBm3FnWRW1od3wKTpaECPx',
  url: 'my-instant-deployment-3ij3cxz9qr.now.sh',
  meta: '{}',
};
```

## Fields

| Field  | Type     | Required           | Description                      | Example                                 |
| ------ | -------- | ------------------ | -------------------------------- | --------------------------------------- |
| `id`   | _string_ | :heavy_check_mark: | The deployment unique identifier | dpl_5m8CQaRBm3FnWRW1od3wKTpaECPx        |
| `url`  | _string_ | :heavy_check_mark: | The deployment unique URL        | my-instant-deployment-3ij3cxz9qr.now.sh |
| `meta` | _string_ | :heavy_minus_sign: | The deployment metadata          | {}                                      |
