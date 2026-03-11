# vercel-workers

Python SDK for Vercel Queues and Vercel Worker Services.

It includes:

- `send()` and `@subscribe` primitives for publishing and consuming queue messages
- adapters for Celery, Dramatiq, and Django tasks

## Install

```bash
pip install vercel-workers
```

Optional adapter extras:

```bash
pip install "vercel-workers[celery]"
pip install "vercel-workers[dramatiq]"
pip install "vercel-workers[django]"
```

For Celery, the recommended setup is to configure `CELERY_BROKER_URL` and use
the standard `celery.Celery` app. On Vercel and in `vercel dev`, Python
services with worker services default `CELERY_BROKER_URL` to `vercel://`
without overriding a user-defined value.

## Worker Service deployment shape

`vercel.json`

```json
{
  "projectSettings": { "framework": "services" },
  "experimentalServices": {
    "web": {
      "framework": "fastapi",
      "entrypoint": "main.py",
      "routePrefix": "/"
    },
    "worker": {
      "type": "worker",
      "entrypoint": "worker.py",
      "topic": "default",
      "consumer": "default"
    }
  }
}
```

For worker services, `worker.py` should expose worker definitions (for example a `@subscribe` function, Celery `app`, or Dramatiq `broker`) and import task modules so handlers are registered.

## Examples

- `examples/basic`: FastAPI producer + `@subscribe` worker service
- `examples/celery`: Celery + worker service
- `examples/dramatiq`: Dramatiq adapter + worker service
- `examples/django`: Django tasks backend + queue callback route at `/api/queue/callback`

When running outside Vercel, set `VERCEL_QUEUE_TOKEN` (and optionally `VERCEL_QUEUE_BASE_URL`).
For Celery outside Vercel, also point `CELERY_BROKER_URL` at your local broker
(for example Redis) unless you are running against Vercel Queues directly.
