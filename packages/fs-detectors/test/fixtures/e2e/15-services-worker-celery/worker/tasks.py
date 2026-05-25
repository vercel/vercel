from vercel.cache import get_cache
from worker.celery_app import app


@app.task(queue="jobs")
def process_job(payload):
    request_id = payload.get("request_id") if isinstance(payload, dict) else None
    if request_id:
        cache = get_cache(namespace="jobs")
        cache.set(
            str(request_id),
            {"ok": True, "topic": "jobs", "payload": payload},
            options={"ttl": 300},
        )
    return {"ok": True, "payload": payload}
