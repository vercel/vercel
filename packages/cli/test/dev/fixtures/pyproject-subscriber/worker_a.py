from celery import Celery

from worker_result import write_result


QUEUE_NAME = "high-priority"
app = Celery("pyproject-subscriber-high-priority")
app.conf.task_default_queue = QUEUE_NAME


@app.task(name="worker_a.process_job")
def process_job(request_id: str, x: int, y: int) -> dict[str, str | int]:
    return write_result(QUEUE_NAME, request_id, x, y)
