from django.tasks import task


@task(queue_name="jobs")
def process_job(request_id, enqueued_at, priority):
    return {
        "ok": True,
        "request_id": request_id,
        "enqueued_at": enqueued_at,
        "priority": priority,
    }
