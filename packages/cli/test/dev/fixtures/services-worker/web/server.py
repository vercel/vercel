import json
import os

from fastapi import FastAPI
from vercel.workers import send

app = FastAPI()

RESULT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".results")


@app.get("/")
def root():
    return {"service": "web"}


@app.post("/enqueue")
def enqueue():
    result = send("tasks-topic", {"action": "test", "value": 42})
    message_id = result.get("messageId", "")
    os.makedirs(RESULT_DIR, exist_ok=True)
    with open(os.path.join(RESULT_DIR, "send_result.json"), "w") as f:
        json.dump({"messageId": message_id}, f)
    return {"messageId": message_id}
