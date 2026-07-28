# `@vercel/laravel`

Experimental zero-configuration Laravel support for Vercel.

The builder detects a regular Laravel application from `artisan` and
`laravel/framework` in `composer.json`, generates an ephemeral production image,
and hands that image to `@vercel/container`. The application does not need a
Dockerfile or `vercel.json`.

## Platform adapters

| Laravel concern            | Vercel behavior                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| HTTP server                | PHP Apache image with `public/` as its document root                                                  |
| PHP version                | Newest supported PHP version matching Composer's constraint                                           |
| PHP extensions             | Common Laravel extensions plus `ext-*` requirements found in `composer.json` and `composer.lock`      |
| Composer                   | Production install with optimized autoloading and package discovery                                   |
| Vite                       | Detects npm, pnpm, Yarn, or Bun and runs the package's `build` script                                 |
| Public build variables     | Passes declared `VITE_*` build environment variables to Vite                                          |
| Logs                       | Sends Laravel logs to stderr                                                                          |
| Sessions                   | Uses encrypted cookie sessions by default                                                             |
| Cache                      | Uses the in-process array store by default                                                            |
| Queues                     | Uses synchronous execution unless the project configures a durable queue adapter                      |
| Workers and scheduled jobs | Use a Vercel Service command such as `php artisan queue:work` or `php artisan schedule:run`           |
| Image build and deploy     | Reuses Vercel Container registry, OIDC, layer cache, routing, function configuration, and diagnostics |
| Local development          | Builds and runs the same generated image through `vercel dev`                                         |

Set `APP_KEY` as a project environment variable. Database, mail, cache, and
other external service credentials remain normal Laravel environment variables.

Vercel Blob, Queues, and WebSockets should be exposed through a Composer package
that implements Laravel's filesystem, queue, and broadcasting contracts. They
are intentionally not emulated inside this builder: Blob replaces durable local
uploads, Queues replaces a hosted queue daemon, and native WebSockets replaces a
hosted Reverb server. A project can install those adapters without changing the
framework integration.

## Trying a CLI preview

Until the framework is stable, enable experimental detection:

```sh
VERCEL_USE_EXPERIMENTAL_FRAMEWORKS=1 vercel
```

For a Vercel CLI pull request preview, set the project's `VERCEL_CLI_VERSION`
build environment variable to that pull request's CLI tarball URL. A stock
Laravel application can then deploy without Vercel-specific files.
