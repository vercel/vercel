from django.tasks import task
from vercel.cache import get_cache


@task(queue_name="jobs")
def process_job(request_id, enqueued_at, priority):
    cache = get_cache(namespace="jobs")
    cache.set(
        str(request_id),
        {
            "ok": True,
            "topic": "jobs",
            "request_id": request_id,
            "enqueued_at": enqueued_at,
            "priority": priority,
        },
        options={"ttl": 300},
    )
    return {
        "ok": True,
        "request_id": request_id,
        "enqueued_at": enqueued_at,
        "priority": priority,
    }
