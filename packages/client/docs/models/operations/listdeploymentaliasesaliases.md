# ListDeploymentAliasesAliases

A list of the aliases assigned to the deployment

## Example Usage

```typescript
import { ListDeploymentAliasesAliases } from '@vercel/client/models/operations';

let value: ListDeploymentAliasesAliases = {
  uid: '2WjyKQmM8ZnGcJsPWMrHRHrE',
  alias: 'my-alias.vercel.app',
  created: new Date('2017-04-26T23:00:34.232Z'),
};
```

## Fields

| Field              | Type                                                                                          | Required           | Description                                                              | Example                  |
| ------------------ | --------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------ | ------------------------ |
| `uid`              | _string_                                                                                      | :heavy_check_mark: | The unique identifier of the alias                                       | 2WjyKQmM8ZnGcJsPWMrHRHrE |
| `alias`            | _string_                                                                                      | :heavy_check_mark: | The alias name, it could be a `.vercel.app` subdomain or a custom domain | my-alias.vercel.app      |
| `created`          | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) | :heavy_check_mark: | The date when the alias was created                                      | 2017-04-26T23:00:34.232Z |
| `redirect`         | _string_                                                                                      | :heavy_minus_sign: | Target destination domain for redirect when the alias is a redirect      |                          |
| `protectionBypass` | Record<string, _operations.ListDeploymentAliasesProtectionBypass_>                            | :heavy_minus_sign: | The protection bypass for the alias                                      |                          |
