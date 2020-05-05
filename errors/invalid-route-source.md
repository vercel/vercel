# Invalid Custom Route `source`

#### Why This Error Occurred

When defining custom routes a route was added that causes an error during parsing. This can be due to trying to use normal `RegExp` syntax like negative lookaheads (`?!exclude`) without following `path-to-regexp`'s syntax for it.

#### Possible Ways to Fix It

Wrap the `RegExp` part of your `source` as an un-named parameter.

**Before**

```js
{
  source: '/feedback/(?!general)',
  destination: '/api/feedback/general'
}
```

**After**

```js
{
  source: '/feedback/((?!general).*)',
  destination: '/api/feedback/general'
}
```

Ensure any segments used in the `destination` property are also used in the `source` property.

**Before**

```js
{
  source: '/feedback/:type',
  destination: '/api/feedback/:id'
}
```

**After**

```js
{
  source: '/feedback/:id',
  destination: '/api/feedback/:id'
}
```

### Useful Links

- [path-to-regexp](https://github.com/pillarjs/path-to-regexp/tree/v6.1.0)
- [named parameters](https://github.com/pillarjs/path-to-regexp/blob/v6.1.0/Readme.md#named-parameters)
- [un-named paramters](https://github.com/pillarjs/path-to-regexp/blob/v6.1.0/Readme.md#unnamed-parameters)
