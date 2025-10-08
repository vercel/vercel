# Bad Type in Env Value

#### Why This Error Occurred

You supplied a value in the `env` of your deployment whose type is not allowed.

This occurs for example if you use a `Boolean` as a type:

```json
{
  "env": {
    "VALID": 1,
    "INVALID": true
  }
}
```

#### Possible Ways to Fix It

The only accepted types are `String` or `Number`. If you're using a
`Boolean`, consider using `1` (`Number`) or `"true"` (`String`).
