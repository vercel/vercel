# `@vercel/static-build` Failed to detect a server running

#### Why This Warning Occurred

When running `vercel dev`, the `@vercel/static-build` builder proxies relevant HTTP
requests to the server that is created by the `dev` script in the
`package.json` file.

In order for `vercel dev` to know which port the server is running on, the builder
is provided a `$PORT` environment variable that the server _must_ bind to. The
error "Failed to detect a server running on port" is printed if the builder fails
to detect a server listening on that specific port within five minutes.

#### Possible Ways to Fix It

Please ensure that your `dev` script binds the spawned development server on
the provided `$PORT` that the builder expects the server to bind to.

For example, if you are using Gatsby, your `dev` script must use the `-p`
(port) option to bind to the `$PORT` specified from the builder:

> _In Windows environments, reference the `PORT` environment variable with `%PORT%`_

```
{
  ...
  "scripts": {
    ...
    "dev": "gatsby develop -p $PORT"
  }
}
```

Consult your static builder program's `--help` or documentation to figure out what
the command line flag to bind to a specific port is (in many cases, it is one of:
`-p` / `-P` / `--port`).
