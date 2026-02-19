"""
Django Tasks example using Vercel Queues backend.

This demonstrates how to define background tasks using Django 6.0+'s
built-in tasks framework with Vercel Queues as the backend.
"""

from __future__ import annotations

from django.tasks import TaskContext, task

# This queue name MUST match the Vercel Queues topic you configure in vercel.json.
QUEUE_NAME = "django-tasks"


@task(queue_name=QUEUE_NAME)
def add(x: int, y: int) -> int:
    """Simple task that adds two numbers."""
    result = x + y
    print(f"[django task] add({x}, {y}) = {result}")
    raise Exception("test error")
    return result


@task(queue_name=QUEUE_NAME)
def multiply(x: int, y: int) -> int:
    """Simple task that multiplies two numbers."""
    result = x * y
    print(f"[django task] multiply({x}, {y}) = {result}")
    return result


@task(queue_name=QUEUE_NAME, takes_context=True)
def add_with_context(context: TaskContext, x: int, y: int) -> dict:
    """
    Task that demonstrates using TaskContext.

    The context provides access to task metadata like attempt number,
    task result ID, etc.
    """
    result = x + y
    print(
        f"[django task] add_with_context({x}, {y}) = {result} "
        f"(attempt {context.attempt}, task_id={context.task_result.id})"
    )
    return {
        "result": result,
        "task_id": context.task_result.id,
        "attempt": context.attempt,
    }
