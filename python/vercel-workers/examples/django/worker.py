#!/usr/bin/env python
"""
Local polling worker for Django tasks using Vercel Queues.

This script polls Vercel Queues for tasks and executes them locally.
Use this for local development when you want to test the full queue flow.

Usage:
    python worker.py

Environment:
    VERCEL_QUEUE_TOKEN - Required: Your Vercel Queue API token
    DJANGO_SETTINGS_MODULE - Optional: Defaults to 'config.settings'
"""

from __future__ import annotations

import os
import sys

# Add the project root to the path so imports work correctly.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Ensure Django settings are configured before importing Django modules.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django

django.setup()

import api.tasks  # noqa: E402
from django.tasks import task_backends  # noqa: E402

from vercel.workers.django import PollingWorker  # noqa: E402


def main() -> None:
    backend = task_backends["default"]

    queue_name = api.tasks.QUEUE_NAME

    print(
        "[django-tasks worker] starting polling worker",
        {"queue": queue_name, "backend": backend.alias},
    )

    worker = PollingWorker(
        backend,
        queue_name=queue_name,
        debug=True,
        poll_interval_seconds=1.0,
        visibility_timeout_seconds=60,
    )

    try:
        worker.start()
    except KeyboardInterrupt:
        print("\n[django-tasks worker] shutting down...")
        worker.stop()


if __name__ == "__main__":
    main()
