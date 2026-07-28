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
| Blob                       | Registers a private Vercel Blob-backed default Laravel filesystem disk                                |
| Queues                     | Registers the Laravel queue driver and emits a private `queue/v2beta` consumer                        |
| Broadcasting               | Registers a Reverb-compatible Vercel broadcasting connection                                          |
| Workers and scheduled jobs | Use a Vercel Service command such as `php artisan queue:work` or `php artisan schedule:run`           |
| Image build and deploy     | Reuses Vercel Container registry, OIDC, layer cache, routing, function configuration, and diagnostics |
| Local development          | Builds and runs the same generated image through `vercel dev`                                         |

Set `APP_KEY` as a project environment variable. Database, mail, cache, and
other external service credentials remain normal Laravel environment variables.

Vercel Blob, Queues, and WebSockets are exposed through adapters bundled into
the generated runtime image. Applications keep using Laravel's filesystem,
queue, and broadcasting contracts and do not install a Vercel-specific Composer
package. The builder adds a private push consumer for the `laravel` topic. Queue
callbacks run through Laravel's own worker and do not require a daemon.

Configure one or more push consumers in `composer.json`:

```json
{
  "extra": {
    "vercel": {
      "queues": [
        {
          "topic": "laravel",
          "maxConcurrency": 10,
          "retryAfterSeconds": 30
        }
      ]
    }
  }
}
```

Set `extra.vercel.queues` to `false` to opt into poll-only mode.

## Trying a CLI preview

Until the framework is stable, enable experimental detection:

```sh
VERCEL_USE_EXPERIMENTAL_FRAMEWORKS=1 vercel
```

For a Vercel CLI pull request preview, set the project's `VERCEL_CLI_VERSION`
build environment variable to that pull request's CLI tarball URL. A stock
Laravel application can then deploy without Vercel-specific files.
