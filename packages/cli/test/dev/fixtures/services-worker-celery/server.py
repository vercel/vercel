from fastapi import FastAPI

from worker.tasks import process_job

app = FastAPI()


@app.get("/")
def root():
    return {"service": "web"}


@app.post("/enqueue")
def enqueue():
    result = process_job.delay({"action": "test", "value": 42})
    return {"taskId": str(result.id)}
