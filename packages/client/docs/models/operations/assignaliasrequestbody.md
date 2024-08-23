# AssignAliasRequestBody

## Example Usage

```typescript
import { AssignAliasRequestBody } from '@vercel/client/models/operations';

let value: AssignAliasRequestBody = {
  alias: 'my-alias.vercel.app',
  redirect: null,
};
```

## Fields

| Field      | Type     | Required           | Description                                                                                                                                                                        | Example             |
| ---------- | -------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `alias`    | _string_ | :heavy_minus_sign: | The alias we want to assign to the deployment defined in the URL                                                                                                                   | my-alias.vercel.app |
| `redirect` | _string_ | :heavy_minus_sign: | The redirect property will take precedence over the deployment id from the URL and consists of a hostname (like test.com) to which the alias should redirect using status code 307 | <nil>               |
