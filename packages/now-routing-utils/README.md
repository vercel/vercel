# @now/routing-utils

Route validation utilities

## Usage

`yarn add @now/routing-utils`

```ts
import { normalizeRoutes } from '@now/routing-utils';

const { routes, error } = normalizeRoutes(inputRoutes);

if (error) {
  console.log(error.code, error.message);
}
```

```ts
import { routesSchema } from '@now/routing-utils';

const ajv = new Ajv();
const validate = ajv.compile(routesSchema);
const valid = validate([{ src: '/about', dest: '/about.html' }]);

if (!valid) console.log(validate.errors);
```
