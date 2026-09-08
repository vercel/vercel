from typing import Any

from vercel.cache.aio import get_cache
from vercel.queue import Message, subscribe

cache = get_cache(namespace="queue-cache")


@subscribe(topic="cache-demo")
async def complete_task(message: Message[dict[str, Any]]) -> None:
    task_id = str(message.payload["taskId"])
    await cache.set(
        f"task:{task_id}",
        {"completed": True, "messageId": message.message_id},
        {"ttl": 300},
    )
