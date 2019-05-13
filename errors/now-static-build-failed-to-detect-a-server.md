# `@now/static-build` Failed to detect a server running

#### Why This Warning Occurred

When running `now dev`, the `@now/static-build` builder proxies relevant HTTP
requests to the server that is created by the `now-dev` script in the
`package.json` file.

In order for `now dev` to know which port the server is running on, the builder
is provided a `$PORT` environment variable that the server *must* bind to. The
error "Failed to detect a server running on port" is printed if the builder fails
to detect a server listening on that specific port within five minutes.

#### Possible Ways to Fix It

Please ensure that your `now-dev` script binds the spawned development server on
the provided `$PORT` that the builder expects the server to bind to.

For example, if you are using Gatsby, your `now-dev` script must use the `-p`
(port) option to bind to the `$PORT` specified from the builder:

```
{
  ...
  "scripts": {
    ...
    "now-dev": "gatsby develop -p $PORT"
  }
}
```

Consult your static builder program's `--help` or documentation to figure out what
the command line flag to bind to a specific port is (in many cases, it is one of:
`-p` / `-P` / `--port`).

### Useful Links

- [`@now/static-build` Local Development Documentation](https://zeit.co/docs/v2/deployments/official-builders/static-build-now-static-build#local-development)
