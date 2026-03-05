from django.tasks import task


@task(queue_name="jobs")
def process_job():
    return {"ok": True}
