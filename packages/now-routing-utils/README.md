# @now/routing-utils

Route validation utilities

## Usage

`yarn add @now/routing-utils`

exports.normalizeRoutes:
`(routes: Array<Route> | null) => { routes: Array<Route> | null; error: NowError | null }`

exports.schema:

```js
const ajv = new Ajv();
const validate = ajv.compile(schema);
const valid = validate([{ src: '/about', dest: '/about.html' }]);

if (!valid) console.log(validate.errors);
```
