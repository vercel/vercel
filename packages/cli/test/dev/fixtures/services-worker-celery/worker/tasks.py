import json
import os

from worker.celery import QUEUE_NAME, app

RESULT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".results")


@app.task(bind=True, queue=QUEUE_NAME, name="tasks.process_job")
def process_job(self, payload):
    task_id = str(getattr(self.request, "id", ""))
    os.makedirs(RESULT_DIR, exist_ok=True)
    with open(os.path.join(RESULT_DIR, "celery_worker_result.json"), "w") as f:
        json.dump({"executed": True, "payload": payload, "taskId": task_id}, f)
    return {"ok": True}
