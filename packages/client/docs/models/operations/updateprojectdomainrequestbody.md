# UpdateProjectDomainRequestBody

## Example Usage

```typescript
import { UpdateProjectDomainRequestBody } from '@vercel/client/models/operations';

let value: UpdateProjectDomainRequestBody = {
  gitBranch: null,
  redirect: 'foobar.com',
  redirectStatusCode: 307,
};
```

## Fields

| Field                | Type                                                                           | Required           | Description                            | Example    |
| -------------------- | ------------------------------------------------------------------------------ | ------------------ | -------------------------------------- | ---------- |
| `gitBranch`          | _string_                                                                       | :heavy_minus_sign: | Git branch to link the project domain  | <nil>      |
| `redirect`           | _string_                                                                       | :heavy_minus_sign: | Target destination domain for redirect | foobar.com |
| `redirectStatusCode` | [operations.RedirectStatusCode](../../models/operations/redirectstatuscode.md) | :heavy_minus_sign: | Status code for domain redirect        | 307        |
