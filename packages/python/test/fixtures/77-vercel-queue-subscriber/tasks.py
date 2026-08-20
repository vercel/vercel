# Subscriber entrypoint ("tasks"): a bare module path with no object attr.
# Importing the module registers the subscription; the builder serves it
# through vercel.queue's generated ASGI handler.
from __future__ import annotations

from vercel.cache import get_cache
from vercel.queue import subscribe

RESULT_CACHE_NAMESPACE = "vercel-queue-results"
TOPIC = "native-add"


@subscribe(topic=TOPIC)
async def add(task) -> None:
    get_cache(namespace=RESULT_CACHE_NAMESPACE).set(
        str(task["request_id"]),
        {"requestId": task["request_id"], "sum": task["x"] + task["y"]},
        options={"ttl": 300},
    )
