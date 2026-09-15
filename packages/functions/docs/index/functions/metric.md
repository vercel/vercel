[**@vercel/functions**](../../README.md)

***

# Function: metric()

> **metric**(`name`, `value`, `tags?`): `void`

Defined in: [packages/functions/src/metric.ts:28](https://github.com/vercel/vercel/blob/main/packages/functions/src/metric.ts#L28)

Reports a custom metric for the current Vercel Function invocation.

## Parameters

### name

`string`

The name of the metric.

### value

`number`

The numeric value of the metric.

### tags?

[`Record`](https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type)\<`string`, `string`\>

Optional tags to attach to the metric.

## Returns

`void`

## Example

```js
import { metric } from '@vercel/functions';

metric('tinybird.query_ms', 100, {
  query: 'getUser',
});
```
