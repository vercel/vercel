from __future__ import annotations

import dramatiq
from dramatiq.results import Results
from vercel.integrations.dramatiq import VercelQueueBroker, VercelRuntimeCacheBackend

QUEUE_NAME = "dramatiq"
MESSAGE_CACHE_NAMESPACE = "dramatiq-messages"

broker = VercelQueueBroker()
broker.add_middleware(Results(backend=VercelRuntimeCacheBackend()))
dramatiq.set_broker(broker)


@dramatiq.actor(queue_name=QUEUE_NAME, store_results=True)
def process_job(request_id: str, x: int, y: int) -> dict[str, object]:
    return {"requestId": request_id, "sum": x + y}
