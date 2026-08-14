from __future__ import annotations

from .app import get_asgi_app, get_wsgi_app, handle_queue_callback
from .backend import DjangoTaskEnvelope, VercelQueuesBackend
from .worker import PollingWorker, PollingWorkerConfig

"""
Integration for Django 6.0+'s `django.tasks` framework.

This module provides:
  - a Django `BaseTaskBackend` implementation that enqueues tasks to Vercel Queues
  - WSGI/ASGI callback apps that execute tasks when Vercel Queues triggers an HTTP callback
  - A polling worker for local development

The integration is optional; install with:
  pip install "vercel-workers[django]"
"""

__all__ = [
    "DjangoTaskEnvelope",
    "PollingWorker",
    "PollingWorkerConfig",
    "VercelQueuesBackend",
    "get_asgi_app",
    "get_wsgi_app",
    "handle_queue_callback",
]
