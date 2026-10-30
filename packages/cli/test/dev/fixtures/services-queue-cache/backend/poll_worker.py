import asyncio
from typing import Any

from vercel.cache.aio import get_cache
from vercel.queue import QueueClient, Topic

cache = get_cache(namespace="queue-cache")
topic = Topic[dict[str, Any]]("cache-demo")


async def main() -> None:
    queue = QueueClient(region="dev1")
    for _ in range(20):
        async for delivery in queue.poll(
            topic,
            "external-python-worker",
            limit=1,
        ):
            async with delivery as message:
                task_id = str(message.payload["taskId"])
                await cache.set(
                    f"task:{task_id}",
                    {
                        "completed": True,
                        "messageId": message.message_id,
                    },
                    {"ttl": 300},
                )
            return
        await asyncio.sleep(0.5)

    raise RuntimeError("no queue message was available")


asyncio.run(main())
