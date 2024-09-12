# AssignAliasResponseBody

The alias was successfully assigned to the deployment

## Example Usage

```typescript
import { AssignAliasResponseBody } from "@vercel/sdk/models/operations";

let value: AssignAliasResponseBody = {
  uid: "2WjyKQmM8ZnGcJsPWMrHRHrE",
  alias: "my-alias.vercel.app",
  created: new Date("2017-04-26T23:00:34.232Z"),
  oldDeploymentId: "dpl_FjvFJncQHQcZMznrUm9EoB8sFuPa",
};
```

## Fields

| Field                                                                                                    | Type                                                                                                     | Required                                                                                                 | Description                                                                                              | Example                                                                                                  |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `uid`                                                                                                    | *string*                                                                                                 | :heavy_check_mark:                                                                                       | The unique identifier of the alias                                                                       | 2WjyKQmM8ZnGcJsPWMrHRHrE                                                                                 |
| `alias`                                                                                                  | *string*                                                                                                 | :heavy_check_mark:                                                                                       | The assigned alias name                                                                                  | my-alias.vercel.app                                                                                      |
| `created`                                                                                                | [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)            | :heavy_check_mark:                                                                                       | The date when the alias was created                                                                      | 2017-04-26T23:00:34.232Z                                                                                 |
| `oldDeploymentId`                                                                                        | *string*                                                                                                 | :heavy_minus_sign:                                                                                       | The unique identifier of the previously aliased deployment, only received when the alias was used before | dpl_FjvFJncQHQcZMznrUm9EoB8sFuPa                                                                         |