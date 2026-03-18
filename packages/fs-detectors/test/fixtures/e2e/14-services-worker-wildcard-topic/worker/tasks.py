import dramatiq


@dramatiq.actor(queue_name="job-events")
def process_job(payload: dict):
    return {"ok": True, "payload": payload}
