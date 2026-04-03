import json
import os

from fastapi import FastAPI

from worker.tasks import process_job

app = FastAPI()

RESULT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".results")


@app.get("/")
def root():
    return {"service": "web"}


@app.post("/enqueue")
def enqueue():
    result = process_job.delay({"action": "test", "value": 42})
    task_id = str(result.id)
    os.makedirs(RESULT_DIR, exist_ok=True)
    with open(os.path.join(RESULT_DIR, "celery_enqueue_result.json"), "w") as f:
        json.dump({"taskId": task_id}, f)
    return {"taskId": task_id}
