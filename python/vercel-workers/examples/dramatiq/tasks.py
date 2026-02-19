from __future__ import annotations

import dramatiq

from vercel.workers.dramatiq import VercelQueuesBroker

# This queue name MUST match the Vercel Queues topic you configure in vercel.json.
QUEUE_NAME = "dramatiq"

# Create a Dramatiq broker that publishes tasks into Vercel Queues.
broker = VercelQueuesBroker()
dramatiq.set_broker(broker)


@dramatiq.actor(queue_name=QUEUE_NAME)
def add(x: int, y: int) -> int:
    result = x + y
    print(f"[dramatiq task] add({x}, {y}) = {result}")
    return result


@dramatiq.actor(queue_name=QUEUE_NAME)
def multiply(x: int, y: int) -> int:
    result = x * y
    print(f"[dramatiq task] multiply({x}, {y}) = {result}")
    return result


@dramatiq.actor(queue_name=QUEUE_NAME)
def greet(name: str) -> str:
    message = f"Hello, {name}!"
    print(f"[dramatiq task] greet({name!r}) = {message!r}")
    return message
