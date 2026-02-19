# Celery + Vercel Queues (via `vercel-workers`)

This example shows a Celery app that publishes tasks into **Vercel Queues** using the
`vercelqueue://` broker (implemented by `vercel.workers.celery`).

It also includes a **local polling worker** (`worker.py`) that continuously receives
messages from the Queue Service API and executes the Celery tasks. This is intended
for local development or non-serverless environments.

> Note: On Vercel, you generally **do not poll**. Instead, you configure a Vercel Queue
> Trigger to POST CloudEvents to an HTTP endpoint, and that endpoint claims the message
> by ID and runs the Celery task (see “Deploy on Vercel” below).

## Run locally

From the `vqs-py` repo root:

```bash
# Configure a real Queue Service target (token + optionally base URL/path).
# - In Vercel, the OIDC token is resolved automatically.
# - Outside Vercel, you must provide VERCEL_QUEUE_TOKEN (or pass token explicitly in code).
export VERCEL_QUEUE_TOKEN="..."
# export VERCEL_QUEUE_BASE_URL="http://127.0.0.1:3000"
# export VERCEL_QUEUE_BASE_PATH="/api/v2/messages"

uv run --project examples/celery uvicorn main:app --reload --port 8000
```

In a second terminal, run a local polling worker (long-running process):

```bash
uv run --project examples/celery python worker.py
```

Then enqueue a task:

```bash
curl -X POST "http://127.0.0.1:8000/enqueue" \
  -H "Content-Type: application/json" \
  -d '{"x": 2, "y": 3}'
```

This will enqueue a Celery task into Vercel Queues (topic: `celery`), and the polling
worker should receive and execute it.

## Broker transport options (optional)

The `vercelqueue://` transport can be configured via Celery's `broker_transport_options`:

```python
celery_app.conf.broker_transport_options = {
    # Use task id as the queue idempotency key (default: True)
    "use_task_id_as_idempotency_key": True,

    # Queue API configuration (otherwise use env vars / OIDC)
    "token": "...",
    "base_url": "http://127.0.0.1:3000",
    "base_path": "/api/v2/messages",

    # Optional queue headers
    "retention_seconds": 86400,
    "deployment_id": "...",

    # httpx timeout in seconds
    "timeout": 10.0,

    # Debug: include the original Kombu message in the stored envelope payload
    "include_raw_message": False,
}
```

## Deploy on Vercel

- **API app**: deploy `main.py` as a FastAPI app (publishes tasks).
- **Queue worker (serverless)**: configure a Vercel Queue Trigger for your topic/consumer
  and point it at an HTTP endpoint that runs the Celery callback app (WSGI/ASGI).

  For example, create an ASGI entrypoint that exports the callback app:

  ```python
  # callback_app.py
  from tasks import app as celery_app

  app = celery_app.get_asgi_app()
  ```

  Then deploy that entrypoint and configure the Queue Trigger to invoke it.
