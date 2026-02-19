# vercel-workers

## Installation

```bash
pip install vercel-workers
```

## Django 6.0 `django.tasks` integration (Vercel Queues)

This repo ships an optional `django.tasks` backend that enqueues tasks into **Vercel Queues** and
executes them via a **queue callback route** (similar in spirit to the Celery integration in this repo).

### Install

```bash
pip install "vercel-workers[django]"
```

### Configure Django

In `settings.py`:

```python
TASKS = {
    "default": {
        "BACKEND": "vercel.workers.django.backend.VercelQueuesBackend",
        # Optional: restrict which Django queue_name values are allowed.
        "QUEUES": ["default"],
        "OPTIONS": {
            # TaskResult storage (uses Django cache; for production prefer Redis).
            "cache_alias": "default",
            "result_ttl_seconds": 86400,

            # Callback execution settings (visibility/lease).
            "visibility_timeout_seconds": 30,
            "visibility_refresh_interval_seconds": 10.0,

            # Basic retry policy for task exceptions.
            "max_attempts": 3,
            "retry_backoff_base_seconds": 5,
            "retry_backoff_factor": 2.0,

            # Optional publish-time overrides passed through to vercel.workers.client.send()
            # (you can also set env vars like VERCEL_QUEUE_TOKEN / VERCEL_QUEUE_BASE_URL).
            # "token": "...",
            # "base_url": "...",
            # "base_path": "...",
            # "retention_seconds": 86400,
            # "deployment_id": "...",
            # "timeout": 10.0,
        },
    }
}
```

### Define and enqueue tasks

```python
from django.tasks import task


@task(queue_name="default")
def send_email(to: str) -> None:
    ...


result = send_email.enqueue(to="user@example.com")
```

### Expose the Vercel Queue callback route

You must expose a **WSGI/ASGI endpoint** that Vercel Queues can POST CloudEvents to:

- WSGI: `vercel.workers.django.get_wsgi_app(backend_alias="default")`
- ASGI: `vercel.workers.django.get_asgi_app(backend_alias="default")`

How you mount that depends on your deployment setup (Vercel Python entrypoint / framework).

### Notes / limitations

- **Queue naming**: Django `Task.queue_name` maps directly to the Vercel Queue name you publish to.
- **Priority**: not supported (Django Tasks will validate priority is default).
- **run_after**: supported by delaying the queue message (visibility timeout) when it is delivered early.
- **Results**: stored in Django cache. With `LocMemCache`, `get_result()` is process-local; for real
  cross-request results use Redis (or another shared cache backend).
