[![npm downloads](https://img.shields.io/npm/dm/h3.svg?style=flat-square)](https://npmjs.com/package/h3)
[![version](https://img.shields.io/npm/v/h3/latest.svg?style=flat-square)](https://npmjs.com/package/h3)
[![bundlephobia](https://img.shields.io/bundlephobia/min/h3/latest.svg?style=flat-square)](https://bundlephobia.com/result?p=h3)
[![build status](https://img.shields.io/github/workflow/status/unjs/h3/ci/main?style=flat-square)](https://github.com/unjs/h3/actions)
[![coverage](https://img.shields.io/codecov/c/gh/unjs/h3/main?style=flat-square)](https://codecov.io/gh/unjs/h3)
[![jsDocs.io](https://img.shields.io/badge/jsDocs.io-reference-blue?style=flat-square)](https://www.jsdocs.io/package/h3)

> H3 is a minimal h(ttp) framework built for high performance and portability

<!-- ![h3 - Tiny JavaScript Server](.github/banner.svg) -->

## Features

✔️ &nbsp;**Portable:** Works perfectly in Serverless, Workers, and Node.js

✔️ &nbsp;**Compatible:** Support connect/express middleware

✔️ &nbsp;**Minimal:** Small, tree-shakable and zero-dependency

✔️ &nbsp;**Modern:** Native promise support

✔️ &nbsp;**Extendable:** Ships with a set of composable utilities but can be extended

✔️ &nbsp;**Router:** Super fast route matching using [unjs/radix3](https://github.com/unjs/radix3)

## Install

```bash
# Using npm
npm install h3

# Using yarn
yarn add h3

# Using pnpm
pnpm add h3
```

## Usage

```ts
import { createServer } from 'http'
import { createApp } from 'h3'

const app = createApp()
app.use('/', () => 'Hello world!')

createServer(app).listen(process.env.PORT || 3000)
```

<details>
 <summary>Example using <a href="https://github.com/unjs/listhen">listhen</a> for an elegant listener.</summary>

```ts
import { createApp } from 'h3'
import { listen } from 'listhen'

const app = createApp()
app.use('/', () => 'Hello world!')

listen(app)
```
</details>

## Router

The `app` instance created by `h3` uses a middleware stack (see [how it works](#how-it-works)) with the ability to match route prefix and apply matched middleware.

To opt-in using a more advanced and convenient routing system, we can create a router instance and register it to app instance.

```ts
import { createApp, createRouter } from 'h3'

const app = createApp()

const router = createRouter()
 .get('/', () => 'Hello World!')
 .get('/hello/:name', req => `Hello ${req.context.params.name}!`)

app.use(router)
```

**Tip:** We can register same route more than once with different methods.

Routes are internally stored in a [Radix Tree](https://en.wikipedia.org/wiki/Radix_tree) and matched using [unjs/radix3](https://github.com/unjs/radix3).

## More usage examples

```js
// Handle can directly return object or Promise<object> for JSON response
app.use('/api', (req) => ({ url: req.url }))

// We can have better matching other than quick prefix match
app.use('/odd', () => 'Is odd!', { match: url => url.substr(1) % 2 })

// Handle can directly return string for HTML response
app.use(() => '<h1>Hello world!</h1>')

// We can chain calls to .use()
app.use('/1', () => '<h1>Hello world!</h1>')
   .use('/2', () => '<h1>Goodbye!</h1>')

// Legacy middleware with 3rd argument are automatically promisified
app.use((req, res, next) => { req.setHeader('X-Foo', 'bar'); next() })

// Force promisify a legacy middleware
// app.use(someMiddleware, { promisify: true })

// Lazy loaded routes using { lazy: true }
// app.use('/big', () => import('./big'), { lazy: true })
```

## Utilities

Instead of adding helpers to `req` and `res`, h3 exposes them as composable utilities.

- `useRawBody(req, encoding?)`
- `useBody(req)`
- `useCookies(req)`
- `useCookie(req, name)`
- `setCookie(res, name, value, opts?)`
- `deleteCookie(res, name, opts?)`
- `useQuery(req)`
- `send(res, data, type?)`
- `sendRedirect(res, location, code=302)`
- `appendHeader(res, name, value)`
- `createError({ statusCode, statusMessage, data? })`
- `sendError(res, error, debug?)`
- `defineHandle(handle)`
- `defineMiddleware(middlware)`
- `useMethod(req, default?)`
- `isMethod(req, expected, allowHead?)`
- `assertMethod(req, expected, allowHead?)`

👉 You can learn more about usage in [JSDocs Documentation](https://www.jsdocs.io/package/h3#package-functions).

## How it works?

Using `createApp`, it returns a standard `(req, res)` handler function and internally an array called middleware stack. using`use()` method we can add an item to this internal stack.

When a request comes, each stack item that matches the route will be called and resolved until [`res.writableEnded`](https://nodejs.org/api/http.html#http_response_writableended) flag is set, which means the response is sent. If `writableEnded` is not set after all middleware, a `404` error will be thrown. And if one of the stack items resolves to a value, it will be serialized and sent as response as a shorthand method to sending responses.

For maximum compatibility with connect/express middleware (`req, res, next?` signature), h3 converts classic middleware into a promisified version ready to use with stack runner:

- If middleware has 3rd next/callback param, the promise will `resolve/reject` when called
- If middleware returns a promise, it will be **chained** to the main promise
- If calling middleware throws an immediate error, the promise will be rejected
- On `close` and `error` events of res, the promise will `resolve/reject` (to ensure if middleware simply calls `res.end`)

## License

MIT
