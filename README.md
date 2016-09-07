# &#120491; now

Realtime global deployments for any kind of application.

## How it works

In any directory with a `package.json`, run:

```bash
$ now
```

Every time you run it, you get a new URL (unless nothing's changed).

### Conventions

1. `package.json` must contain a `start` task inside `scripts`.
   If a `now` script is defined, that's used instead.
2. Only files that would be included in `npm publish` are synchronized.
   `package.json` `files` field, `.npmignore` and `.gitignore` are supported.
3. If a build step is needed, specify a `build` task in `scripts`.
   If `now-build` is defined, that's used instead.

## Installing

```bash
$ npm install -g now
> Enter your email: rauchg@gmail.com.
> We sent an email. Click to log in.
```

## Features

- **Slim**. No reliance on Git.
- **Fast**. Blazing fast sync with deduping.
- **Standard**. Respects npm and Node.JS conventions.
- **Easy**. No need to specify ports, `Dockerfile` or config.

## Options

```
-d  Debug mode. Lists all files to be uploaded.
-f  Force. Creates a new URL even if nothing has changed.
```
