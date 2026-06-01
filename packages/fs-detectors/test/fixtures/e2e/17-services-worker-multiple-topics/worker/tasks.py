import dramatiq
from vercel.cache import get_cache


def _record_processed(topic: str, payload: dict) -> None:
    request_id = payload.get("request_id") if isinstance(payload, dict) else None
    if not request_id:
        return
    cache = get_cache(namespace=topic)
    cache.set(
        str(request_id),
        {"ok": True, "topic": topic, "payload": payload},
        options={"ttl": 300},
    )


@dramatiq.actor(queue_name="orders")
def process_order(payload: dict):
    _record_processed("orders", payload)
    return {"ok": True, "payload": payload}


@dramatiq.actor(queue_name="events")
def process_event(payload: dict):
    _record_processed("events", payload)
    return {"ok": True, "payload": payload}
