import dramatiq
from vercel.cache import get_cache


@dramatiq.actor(queue_name="job-events")
def process_job(payload: dict):
    request_id = payload.get("request_id")
    if request_id:
        cache = get_cache(namespace="job-events")
        cache.set(
            str(request_id),
            {"ok": True, "topic": "job-events", "payload": payload},
            options={"ttl": 300},
        )
    return {"ok": True, "payload": payload}
