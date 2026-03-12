"""
Integration for Dramatiq with Vercel Queues as the backend.

This module provides:
  - A Dramatiq broker that publishes tasks to Vercel Queues
  - WSGI/ASGI callback apps that execute tasks when Vercel Queues triggers an HTTP callback
  - A polling worker for local development

The integration is optional; install with:
  pip install "vercel-workers[dramatiq]"

Usage:

    from vercel.workers.dramatiq import VercelQueuesBroker
    import dramatiq

    # Create and set the broker
    broker = VercelQueuesBroker()
    dramatiq.set_broker(broker)

    # Define actors
    @dramatiq.actor
    def my_task(x, y):
        return x + y

    # Enqueue tasks
    my_task.send(1, 2)

For serverless deployments on Vercel:

    from vercel.workers.dramatiq import VercelQueuesBroker, get_wsgi_app
    import dramatiq

    broker = VercelQueuesBroker()
    dramatiq.set_broker(broker)

    # Import actors to register them
    from tasks import my_task

    # Create the callback app
    app = get_wsgi_app(broker)

For local development:

    from vercel.workers.dramatiq import VercelQueuesBroker, PollingWorker
    import dramatiq

    broker = VercelQueuesBroker()
    dramatiq.set_broker(broker)

    # Import actors
    from tasks import my_task

    worker = PollingWorker(broker, queue_name="default")
    worker.start()  # Blocks and polls indefinitely
"""

from __future__ import annotations

from .app import (
    DramatiqWorkerConfig,
    get_asgi_app,
    get_wsgi_app,
    handle_queue_callback,
)
from .broker import (
    DramatiqTaskEnvelope,
    VercelQueuesBroker,
    VercelQueuesBrokerOptions,
)
from .worker import PollingWorker

__all__ = [
    # Broker
    "VercelQueuesBroker",
    "VercelQueuesBrokerOptions",
    "DramatiqTaskEnvelope",
    # App (WSGI/ASGI)
    "DramatiqWorkerConfig",
    "get_wsgi_app",
    "get_asgi_app",
    "handle_queue_callback",
    # Worker
    "PollingWorker",
]
