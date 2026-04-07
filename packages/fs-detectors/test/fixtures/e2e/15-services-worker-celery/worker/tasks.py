from worker.celery_app import app


@app.task(queue="jobs")
def process_job(payload):
    print(f"Processing job: {payload}")
    return {"ok": True, "payload": payload}
