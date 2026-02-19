#!/usr/bin/env python
"""
Example script demonstrating how to enqueue Django tasks.

This script shows how to programmatically enqueue tasks using Django's
tasks framework with the Vercel Queues backend.

Usage:
    python main.py

Environment:
    VERCEL_QUEUE_TOKEN - Required: Your Vercel Queue API token
    DJANGO_SETTINGS_MODULE - Optional: Defaults to 'config.settings'
"""

from __future__ import annotations

import os
import sys

# Ensure Django settings are configured before importing Django modules.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

# Add the project root to the path so imports work correctly.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main() -> None:
    # Initialize Django.
    import django

    django.setup()

    # Now we can import tasks.
    from api.tasks import add, add_with_context, greet

    print("=" * 60)
    print("Django Tasks + Vercel Queues Example")
    print("=" * 60)
    print()

    # Enqueue the add task
    print("Enqueueing add(3, 5)...")
    result = add.enqueue(3, 5)
    print(f"  Task ID: {result.id}")
    print(f"  Status: {result.status}")
    print()

    # Enqueue the greet task
    print("Enqueueing greet('World')...")
    result = greet.enqueue("World")
    print(f"  Task ID: {result.id}")
    print(f"  Status: {result.status}")
    print()

    # Enqueue a task with context
    print("Enqueueing add_with_context(10, 20)...")
    result = add_with_context.enqueue(10, 20)
    print(f"  Task ID: {result.id}")
    print(f"  Status: {result.status}")
    print()

    print("=" * 60)
    print("Tasks have been enqueued!")
    print()
    print("To process them locally, run:")
    print("  python worker.py")
    print()
    print("Or deploy to Vercel with a queue trigger configured to POST to:")
    print("  /api/queue/callback")
    print("=" * 60)


if __name__ == "__main__":
    main()
