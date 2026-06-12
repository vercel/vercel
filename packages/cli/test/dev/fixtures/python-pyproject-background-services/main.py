import json
import os

from fastapi import FastAPI

from tasks import add

app = FastAPI()

RESULT_DIR = os.path.join(os.path.dirname(__file__), ".results")


@app.get("/")
def root():
    return {"service": "pyproject-background-services"}


@app.post("/enqueue-celery")
def enqueue_celery():
    async_result = add.delay(19, 23)
    os.makedirs(RESULT_DIR, exist_ok=True)
    with open(os.path.join(RESULT_DIR, "send_result.json"), "w") as f:
        json.dump({"taskId": async_result.id}, f)
    return {"queued": True, "taskId": async_result.id}
