# now

The fastest way to deploy a Node.JS service.

## How it works

In any directory with a `package.json`, run:

```bash
$ now
> https://some-code-nd23n2.now.sh
```

every time you run it, you get a new URL (unless nothing's changed).

### Conventions

- Only files that would be included in `npm publish` are synchronized.
- `package.json` `files`, `.npmignore`, `.gitignore` supported
- `package.json` must contain a `start` task inside `scripts`.
  If a `now` script is defined, that's used instead.
- Your HTTP server is expected to run in port `3000`.

## Installing

```bash
$ npm install -g now
> Enter your email: rauchg@gmail.com.
> We sent an email. Click to log in.
```

## Features

- No reliance on Git.
- File de-duping.
- Respects NPM conventions.

## Options

```
-d  Debug mode. Lists all files to be uploaded.
-f  Force. Creates a new URL even if nothing has changed.
```
