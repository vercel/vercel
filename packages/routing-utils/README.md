# @vercel/routing-utils

Route validation utilities

## Usage

`npm add @vercel/routing-utils`

```ts
import { normalizeRoutes } from '@vercel/routing-utils';

const { routes, error } = normalizeRoutes(inputRoutes);

if (error) {
  console.log(error.code, error.message);
}
```

```ts
import { routesSchema } from '@vercel/routing-utils';

const ajv = new Ajv();
const validate = ajv.compile(routesSchema);
const valid = validate([{ src: '/about', dest: '/about.html' }]);

if (!valid) console.log(validate.errors);
```
